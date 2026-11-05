/* =====================================================================
   CUBEX - NÚCLEO DEL INVENTARIO

   Este módulo es el ÚNICO lugar del sistema que modifica stock_actual.
   Todas las operaciones:
     1. Se ejecutan dentro de una transacción de MySQL (InnoDB).
     2. Bloquean las filas de stock con SELECT ... FOR UPDATE en orden
        ascendente de id_producto (evita interbloqueos).
     3. Registran un movimiento en movimientos_inventario con una
        clave_operacion ÚNICA, de modo que la misma operación nunca
        se aplica dos veces (reintentos, pagos duplicados, etc.).
     4. Generan alertas de entrada, salida, stock mínimo y agotado.
   ===================================================================== */

const pool = require('../config/database');

const UMBRAL_STOCK_BAJO = Number(process.env.UMBRAL_STOCK_BAJO || 5);

const TIPOS_ENTRADA = ['entrada', 'devolucion', 'cancelacion'];

class ErrorInventario extends Error {
    constructor(status, codigo, mensaje, detalle = null) {
        super(mensaje);
        this.status = status;
        this.codigo = codigo;
        this.detalle = detalle;
    }
}

function esDuplicado(error) {
    return error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062);
}

function esInterbloqueo(error) {
    return error && (
        error.code === 'ER_LOCK_DEADLOCK' ||
        error.errno === 1213 ||
        error.code === 'ER_LOCK_WAIT_TIMEOUT' ||
        error.errno === 1205
    );
}

function enteroPositivo(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

// Agrupa y valida [{ id_producto | id, cantidad }].
function normalizarArticulos(articulos) {
    if (!Array.isArray(articulos) || articulos.length === 0) {
        throw new ErrorInventario(400, 'SIN_ARTICULOS', 'No se recibieron productos.');
    }

    if (articulos.length > 100) {
        throw new ErrorInventario(400, 'DEMASIADOS_ARTICULOS', 'La operación tiene demasiados productos.');
    }

    const agrupados = new Map();

    for (const articulo of articulos) {
        const idProducto = enteroPositivo(articulo?.id_producto ?? articulo?.id);
        const cantidad = enteroPositivo(articulo?.cantidad);

        if (!idProducto || !cantidad) {
            throw new ErrorInventario(
                400,
                'CANTIDAD_INVALIDA',
                'Cada producto debe tener un identificador y una cantidad entera mayor que cero.'
            );
        }

        agrupados.set(idProducto, (agrupados.get(idProducto) || 0) + cantidad);
    }

    return [...agrupados.entries()]
        .map(([id_producto, cantidad]) => ({ id_producto, cantidad }))
        .sort((a, b) => a.id_producto - b.id_producto);
}

// Ejecuta una función dentro de una transacción con reintento por interbloqueo.
async function enTransaccion(trabajo, intentos = 3) {
    for (let intento = 1; ; intento++) {
        const conexion = await pool.getConnection();

        try {
            await conexion.beginTransaction();
            const resultado = await trabajo(conexion);
            await conexion.commit();
            return resultado;
        } catch (error) {
            try {
                await conexion.rollback();
            } catch {
                // La conexión pudo cerrarse; se libera abajo.
            }

            if (esInterbloqueo(error) && intento < intentos) {
                continue;
            }

            throw error;
        } finally {
            conexion.release();
        }
    }
}

// ---------------------------------------------------------------------
// ALERTAS
// ---------------------------------------------------------------------

async function registrarAlertas(conexion, datos) {
    const {
        idProducto,
        nombre,
        anterior,
        resultante,
        minimo,
        tipo,
        cantidad,
        idMovimiento,
        idPedido
    } = datos;

    const alertas = [];
    const esEntrada = resultante > anterior;

    if (esEntrada) {
        alertas.push({
            tipo: 'entrada',
            nivel: 'info',
            mensaje: `Entrada de ${cantidad} unidad(es) de "${nombre}" (${tipo}). Stock: ${anterior} → ${resultante}.`
        });
    } else {
        alertas.push({
            tipo: 'salida',
            nivel: 'info',
            mensaje: `Salida de ${cantidad} unidad(es) de "${nombre}" (${tipo}${idPedido ? `, pedido #${idPedido}` : ''}). Stock: ${anterior} → ${resultante}.`
        });

        // Alertas de nivel: solo al cruzar el umbral hacia abajo.
        if (resultante === 0 && anterior > 0) {
            alertas.push({
                tipo: 'agotado',
                nivel: 'critica',
                mensaje: `"${nombre}" se agotó. Ya no se muestra en la tienda.`
            });
        } else if (resultante > 0 && minimo > 0 && resultante <= minimo && anterior > minimo) {
            alertas.push({
                tipo: 'stock_minimo',
                nivel: 'advertencia',
                mensaje: `"${nombre}" llegó a su stock mínimo (${resultante} de ${minimo}).`
            });
        } else if (
            resultante > 0 &&
            resultante <= UMBRAL_STOCK_BAJO &&
            anterior > UMBRAL_STOCK_BAJO
        ) {
            alertas.push({
                tipo: 'stock_bajo',
                nivel: 'advertencia',
                mensaje: `"${nombre}" tiene pocas unidades (${resultante}).`
            });
        }
    }

    for (const alerta of alertas) {
        await conexion.query(
            `INSERT INTO alertas_inventario
                (id_producto, tipo, nivel, mensaje, stock_actual, id_movimiento)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [idProducto, alerta.tipo, alerta.nivel, alerta.mensaje.slice(0, 255), resultante, idMovimiento]
        );
    }
}

// ---------------------------------------------------------------------
// MOVIMIENTO INDIVIDUAL (requiere una transacción abierta)
// ---------------------------------------------------------------------

/**
 * Mueve el stock de un producto dentro de la transacción recibida.
 * delta > 0 aumenta existencias, delta < 0 las disminuye.
 * Lanza ErrorInventario 409 si el resultado sería negativo y
 * ER_DUP_ENTRY si la clave_operacion ya fue aplicada.
 */
async function moverStockEnConexion(conexion, opciones) {
    const {
        idProducto,
        delta,
        tipo,
        origen,
        motivo = null,
        clave = null,
        idPedido = null,
        idCompra = null,
        idDevolucion = null,
        idUsuario = null
    } = opciones;

    if (!Number.isInteger(delta) || delta === 0) {
        throw new ErrorInventario(400, 'CANTIDAD_INVALIDA', 'La cantidad del movimiento no es válida.');
    }

    if (delta > 0) {
        // Garantiza que exista la fila de stock antes de bloquearla.
        await conexion.query(
            `INSERT INTO stock (id_producto, stock_actual, stock_minimo, stock_maximo)
             VALUES (?, 0, 0, 0)
             ON DUPLICATE KEY UPDATE id_producto = id_producto`,
            [idProducto]
        );
    }

    const [filas] = await conexion.query(
        `SELECT p.id, p.nombre, s.stock_actual, s.stock_minimo
         FROM productos p
         INNER JOIN stock s ON s.id_producto = p.id
         WHERE p.id = ?
         FOR UPDATE`,
        [idProducto]
    );

    if (filas.length === 0) {
        throw new ErrorInventario(
            delta < 0 ? 409 : 404,
            delta < 0 ? 'STOCK_INSUFICIENTE' : 'PRODUCTO_NO_EXISTE',
            delta < 0
                ? `El producto ${idProducto} no tiene existencias.`
                : `El producto ${idProducto} no existe.`
        );
    }

    const fila = filas[0];
    const anterior = Number(fila.stock_actual);
    const resultante = anterior + delta;

    if (resultante < 0) {
        throw new ErrorInventario(
            409,
            'STOCK_INSUFICIENTE',
            `No hay existencias suficientes de "${fila.nombre}". Disponibles: ${anterior}.`,
            [{ id_producto: idProducto, nombre: fila.nombre, solicitado: -delta, disponible: anterior }]
        );
    }

    // Primero el movimiento: si la clave ya existe, MySQL rechaza la
    // inserción y el stock no se modifica.
    const [movimiento] = await conexion.query(
        `INSERT INTO movimientos_inventario
            (id_producto, tipo, cantidad, stock_anterior, stock_resultante,
             id_pedido, id_compra, id_devolucion, id_usuario,
             origen, motivo, clave_operacion)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            idProducto,
            tipo,
            Math.abs(delta),
            anterior,
            resultante,
            idPedido,
            idCompra,
            idDevolucion,
            idUsuario,
            String(origen || 'inventario').slice(0, 60),
            motivo ? String(motivo).slice(0, 255) : null,
            clave
        ]
    );

    const [actualizacion] = await conexion.query(
        `UPDATE stock
         SET stock_actual = ?
         WHERE id_producto = ? AND stock_actual = ?`,
        [resultante, idProducto, anterior]
    );

    if (actualizacion.affectedRows !== 1) {
        // No debería ocurrir porque la fila está bloqueada.
        throw new ErrorInventario(409, 'CONFLICTO_STOCK', 'El stock cambió durante la operación. Intenta de nuevo.');
    }

    await registrarAlertas(conexion, {
        idProducto,
        nombre: fila.nombre,
        anterior,
        resultante,
        minimo: Number(fila.stock_minimo || 0),
        tipo,
        cantidad: Math.abs(delta),
        idMovimiento: movimiento.insertId,
        idPedido
    });

    return {
        id_movimiento: movimiento.insertId,
        id_producto: idProducto,
        nombre: fila.nombre,
        tipo,
        cantidad: Math.abs(delta),
        stock_anterior: anterior,
        stock_resultante: resultante
    };
}

// ---------------------------------------------------------------------
// DISPONIBILIDAD (lectura)
// ---------------------------------------------------------------------

async function consultarDisponibilidad(articulos) {
    const lista = normalizarArticulos(articulos);
    const ids = lista.map(a => a.id_producto);

    const [filas] = await pool.query(
        `SELECT p.id, p.nombre, p.activo,
                COALESCE(s.stock_actual, 0) AS stock_actual,
                CASE WHEN o.activa = 1 THEN o.precio_oferta ELSE p.precio END AS precio
         FROM productos p
         LEFT JOIN stock s   ON s.id_producto = p.id
         LEFT JOIN ofertas o ON o.id_producto = p.id
         WHERE p.id IN (?)`,
        [ids]
    );

    const porId = new Map(filas.map(f => [Number(f.id), f]));

    const resultado = lista.map(articulo => {
        const fila = porId.get(articulo.id_producto);
        const stock = fila ? Math.max(0, Number(fila.stock_actual)) : 0;
        const activo = Boolean(fila && Number(fila.activo) === 1);

        return {
            id_producto: articulo.id_producto,
            nombre: fila ? fila.nombre : null,
            existe: Boolean(fila),
            activo,
            solicitado: articulo.cantidad,
            stock_disponible: activo ? stock : 0,
            precio: fila ? Number(fila.precio) : null,
            suficiente: activo && stock >= articulo.cantidad
        };
    });

    return {
        todo_disponible: resultado.every(r => r.suficiente),
        articulos: resultado
    };
}

// ---------------------------------------------------------------------
// SALIDA POR VENTA CONFIRMADA (idempotente por pedido)
// ---------------------------------------------------------------------

async function movimientosVentaDelPedido(idPedido, conexion = pool) {
    const [filas] = await conexion.query(
        `SELECT id, id_producto, cantidad, stock_anterior, stock_resultante, fecha
         FROM movimientos_inventario
         WHERE id_pedido = ? AND tipo = 'venta'
         ORDER BY id_producto`,
        [idPedido]
    );

    return filas;
}

async function aplicarSalidaVenta({ idPedido, articulos, origen, idUsuario = null }) {
    const pedido = enteroPositivo(idPedido);

    if (!pedido) {
        throw new ErrorInventario(400, 'PEDIDO_INVALIDO', 'El pedido no es válido.');
    }

    const lista = normalizarArticulos(articulos);

    try {
        return await enTransaccion(async conexion => {
            const previos = await movimientosVentaDelPedido(pedido, conexion);

            if (previos.length > 0) {
                return { ya_aplicado: true, movimientos: previos };
            }

            const ids = lista.map(a => a.id_producto);

            // Bloquear todas las filas de una sola vez y en orden.
            const [filas] = await conexion.query(
                `SELECT p.id, p.nombre, p.activo, s.stock_actual
                 FROM productos p
                 LEFT JOIN stock s ON s.id_producto = p.id
                 WHERE p.id IN (?)
                 ORDER BY p.id
                 FOR UPDATE`,
                [ids]
            );

            const porId = new Map(filas.map(f => [Number(f.id), f]));
            const faltantes = [];

            for (const articulo of lista) {
                const fila = porId.get(articulo.id_producto);
                const disponible = fila && Number(fila.activo) === 1
                    ? Math.max(0, Number(fila.stock_actual || 0))
                    : 0;

                if (!fila || disponible < articulo.cantidad) {
                    faltantes.push({
                        id_producto: articulo.id_producto,
                        nombre: fila ? fila.nombre : `Producto ${articulo.id_producto}`,
                        solicitado: articulo.cantidad,
                        disponible
                    });
                }
            }

            if (faltantes.length > 0) {
                throw new ErrorInventario(
                    409,
                    'STOCK_INSUFICIENTE',
                    'No hay existencias suficientes para completar la compra.',
                    faltantes
                );
            }

            const movimientos = [];

            for (const articulo of lista) {
                movimientos.push(await moverStockEnConexion(conexion, {
                    idProducto: articulo.id_producto,
                    delta: -articulo.cantidad,
                    tipo: 'venta',
                    origen: origen || 'registro-pedidos-service',
                    motivo: `Venta confirmada del pedido #${pedido}`,
                    clave: `venta:${pedido}:${articulo.id_producto}`,
                    idPedido: pedido,
                    idUsuario
                }));
            }

            return { ya_aplicado: false, movimientos };
        });
    } catch (error) {
        if (esDuplicado(error)) {
            // Otra solicitud simultánea ya aplicó esta venta.
            return { ya_aplicado: true, movimientos: await movimientosVentaDelPedido(pedido) };
        }

        throw error;
    }
}

// ---------------------------------------------------------------------
// REINTEGRO POR CANCELACIÓN (solo lo que realmente se descontó)
// ---------------------------------------------------------------------

async function reintegrarCancelacion({ idPedido, origen, idUsuario = null, motivo = null }) {
    const pedido = enteroPositivo(idPedido);

    if (!pedido) {
        throw new ErrorInventario(400, 'PEDIDO_INVALIDO', 'El pedido no es válido.');
    }

    return enTransaccion(async conexion => {
        const [vendidos] = await conexion.query(
            `SELECT id_producto, SUM(cantidad) AS cantidad
             FROM movimientos_inventario
             WHERE id_pedido = ? AND tipo = 'venta'
             GROUP BY id_producto
             ORDER BY id_producto`,
            [pedido]
        );

        if (vendidos.length === 0) {
            return {
                reintegrado: false,
                motivo: 'El pedido no tenía descuentos de inventario registrados.',
                movimientos: []
            };
        }

        const movimientos = [];
        const yaReintegrados = [];

        for (const vendido of vendidos) {
            const clave = `cancelacion:${pedido}:${vendido.id_producto}`;

            const [existe] = await conexion.query(
                'SELECT id FROM movimientos_inventario WHERE clave_operacion = ? LIMIT 1',
                [clave]
            );

            if (existe.length > 0) {
                yaReintegrados.push(Number(vendido.id_producto));
                continue;
            }

            movimientos.push(await moverStockEnConexion(conexion, {
                idProducto: Number(vendido.id_producto),
                delta: Number(vendido.cantidad),
                tipo: 'cancelacion',
                origen: origen || 'registro-pedidos-service',
                motivo: motivo || `Cancelación del pedido #${pedido}`,
                clave,
                idPedido: pedido,
                idUsuario
            }));
        }

        return {
            reintegrado: movimientos.length > 0,
            ya_reintegrado: movimientos.length === 0,
            productos_ya_reintegrados: yaReintegrados,
            movimientos
        };
    });
}

// ---------------------------------------------------------------------
// ENTRADA POR DEVOLUCIÓN RECIBIDA EN CONDICIÓN VENDIBLE
// ---------------------------------------------------------------------

async function reintegrarDevolucion({ idDevolucion, idProducto, cantidad, idPedido = null, idUsuario = null, origen }) {
    const devolucion = enteroPositivo(idDevolucion);
    const producto = enteroPositivo(idProducto);
    const unidades = enteroPositivo(cantidad);

    if (!devolucion || !producto || !unidades) {
        throw new ErrorInventario(400, 'DATOS_INVALIDOS', 'Los datos de la devolución no son válidos.');
    }

    try {
        return await enTransaccion(async conexion => {
            const movimiento = await moverStockEnConexion(conexion, {
                idProducto: producto,
                delta: unidades,
                tipo: 'devolucion',
                origen: origen || 'logistica-postventa',
                motivo: `Devolución #${devolucion} recibida en condición vendible`,
                clave: `devolucion:${devolucion}`,
                idPedido: enteroPositivo(idPedido),
                idDevolucion: devolucion,
                idUsuario
            });

            return { reintegrado: true, ya_aplicado: false, movimiento };
        });
    } catch (error) {
        if (esDuplicado(error)) {
            return { reintegrado: true, ya_aplicado: true };
        }

        throw error;
    }
}

// ---------------------------------------------------------------------
// ENTRADA DE MERCANCÍA Y AJUSTES (personal autorizado)
// ---------------------------------------------------------------------

async function registrarEntrada({ idProducto, cantidad, motivo, idUsuario, clave = null }) {
    const producto = enteroPositivo(idProducto);
    const unidades = enteroPositivo(cantidad);

    if (!producto || !unidades) {
        throw new ErrorInventario(400, 'DATOS_INVALIDOS', 'Indica un producto y una cantidad entera mayor que cero.');
    }

    if (unidades > 100000) {
        throw new ErrorInventario(400, 'CANTIDAD_INVALIDA', 'La cantidad es demasiado grande.');
    }

    const [existe] = await pool.query('SELECT id FROM productos WHERE id = ?', [producto]);

    if (existe.length === 0) {
        throw new ErrorInventario(404, 'PRODUCTO_NO_EXISTE', 'El producto no existe.');
    }

    try {
        return await enTransaccion(conexion => moverStockEnConexion(conexion, {
            idProducto: producto,
            delta: unidades,
            tipo: 'entrada',
            origen: 'admin-inventario',
            motivo: motivo || 'Entrada de mercancía',
            clave: clave ? `entrada:${String(clave).slice(0, 100)}` : null,
            idUsuario
        }));
    } catch (error) {
        if (esDuplicado(error)) {
            throw new ErrorInventario(409, 'OPERACION_REPETIDA', 'Esta entrada ya había sido registrada.');
        }

        throw error;
    }
}

async function registrarAjuste({ idProducto, stockNuevo, motivo, idUsuario }) {
    const producto = enteroPositivo(idProducto);
    const nuevo = Number(stockNuevo);

    if (!producto || !Number.isInteger(nuevo) || nuevo < 0) {
        throw new ErrorInventario(400, 'DATOS_INVALIDOS', 'El stock nuevo debe ser un entero mayor o igual a cero.');
    }

    if (!motivo || String(motivo).trim().length < 3) {
        throw new ErrorInventario(400, 'MOTIVO_REQUERIDO', 'Indica el motivo del ajuste.');
    }

    return enTransaccion(async conexion => {
        await conexion.query(
            `INSERT INTO stock (id_producto, stock_actual, stock_minimo, stock_maximo)
             VALUES (?, 0, 0, 0)
             ON DUPLICATE KEY UPDATE id_producto = id_producto`,
            [producto]
        );

        const [filas] = await conexion.query(
            'SELECT stock_actual FROM stock WHERE id_producto = ? FOR UPDATE',
            [producto]
        );

        const anterior = Number(filas[0].stock_actual);
        const delta = nuevo - anterior;

        if (delta === 0) {
            return { sin_cambios: true, stock_resultante: anterior };
        }

        return moverStockEnConexion(conexion, {
            idProducto: producto,
            delta,
            tipo: 'ajuste',
            origen: 'admin-inventario',
            motivo: String(motivo).trim(),
            idUsuario
        });
    });
}

// ---------------------------------------------------------------------
// CONSULTAS
// ---------------------------------------------------------------------

async function listarMovimientos({ idProducto, tipo, idPedido, desde, hasta, limite = 200 }) {
    const condiciones = [];
    const valores = [];

    if (enteroPositivo(idProducto)) {
        condiciones.push('m.id_producto = ?');
        valores.push(Number(idProducto));
    }

    if (tipo && ['entrada', 'venta', 'devolucion', 'cancelacion', 'ajuste'].includes(tipo)) {
        condiciones.push('m.tipo = ?');
        valores.push(tipo);
    }

    if (enteroPositivo(idPedido)) {
        condiciones.push('m.id_pedido = ?');
        valores.push(Number(idPedido));
    }

    if (desde && /^\d{4}-\d{2}-\d{2}$/.test(desde)) {
        condiciones.push('m.fecha >= ?');
        valores.push(`${desde} 00:00:00`);
    }

    if (hasta && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
        condiciones.push('m.fecha <= ?');
        valores.push(`${hasta} 23:59:59`);
    }

    const tope = Math.min(Math.max(Number(limite) || 200, 1), 1000);

    const [filas] = await pool.query(
        `SELECT m.*, p.nombre AS producto, u.nombre_usuario AS usuario
         FROM movimientos_inventario m
         INNER JOIN productos p ON p.id = m.id_producto
         LEFT JOIN usuarios u   ON u.id = m.id_usuario
         ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
         ORDER BY m.fecha DESC, m.id DESC
         LIMIT ${tope}`,
        valores
    );

    return filas;
}

async function resumenVentasPorProducto() {
    const [filas] = await pool.query(
        `SELECT p.id AS id_producto, p.nombre,
                COALESCE(SUM(CASE WHEN m.tipo = 'venta' THEN m.cantidad END), 0) AS vendidas,
                COALESCE(SUM(CASE WHEN m.tipo = 'cancelacion' THEN m.cantidad END), 0) AS canceladas,
                COALESCE(SUM(CASE WHEN m.tipo = 'devolucion' THEN m.cantidad END), 0) AS devueltas,
                COALESCE(SUM(CASE WHEN m.tipo = 'entrada' THEN m.cantidad END), 0) AS entradas,
                COUNT(DISTINCT CASE WHEN m.tipo = 'venta' THEN m.id_pedido END) AS pedidos
         FROM productos p
         LEFT JOIN movimientos_inventario m ON m.id_producto = p.id
         GROUP BY p.id, p.nombre
         ORDER BY vendidas DESC, p.nombre`
    );

    return filas;
}

async function listarAlertas({ soloNoLeidas = false, limite = 100 }) {
    const tope = Math.min(Math.max(Number(limite) || 100, 1), 500);

    const [filas] = await pool.query(
        `SELECT a.*, p.nombre AS producto
         FROM alertas_inventario a
         INNER JOIN productos p ON p.id = a.id_producto
         ${soloNoLeidas ? 'WHERE a.leida = 0' : ''}
         ORDER BY a.fecha DESC, a.id DESC
         LIMIT ${tope}`
    );

    // Estado actual de existencias para el panel (independiente del historial).
    const [estado] = await pool.query(
        `SELECT p.id AS id_producto, p.nombre, s.stock_actual, s.stock_minimo,
                CASE
                    WHEN s.stock_actual <= 0 THEN 'agotado'
                    WHEN s.stock_minimo > 0 AND s.stock_actual <= s.stock_minimo THEN 'stock_minimo'
                    WHEN s.stock_actual <= ? THEN 'stock_bajo'
                END AS nivel
         FROM productos p
         INNER JOIN stock s ON s.id_producto = p.id
         WHERE p.activo = 1
           AND (s.stock_actual <= 0
                OR (s.stock_minimo > 0 AND s.stock_actual <= s.stock_minimo)
                OR s.stock_actual <= ?)
         ORDER BY s.stock_actual ASC, p.nombre`,
        [UMBRAL_STOCK_BAJO, UMBRAL_STOCK_BAJO]
    );

    return { alertas: filas, productos_en_riesgo: estado, umbral_stock_bajo: UMBRAL_STOCK_BAJO };
}

async function marcarAlertasLeidas(ids) {
    const lista = Array.isArray(ids) ? ids.map(enteroPositivo).filter(Boolean) : [];

    if (lista.length === 0) {
        const [resultado] = await pool.query('UPDATE alertas_inventario SET leida = 1 WHERE leida = 0');
        return resultado.affectedRows;
    }

    const [resultado] = await pool.query(
        'UPDATE alertas_inventario SET leida = 1 WHERE id IN (?)',
        [lista]
    );

    return resultado.affectedRows;
}

module.exports = {
    ErrorInventario,
    UMBRAL_STOCK_BAJO,
    TIPOS_ENTRADA,
    normalizarArticulos,
    enTransaccion,
    moverStockEnConexion,
    consultarDisponibilidad,
    aplicarSalidaVenta,
    reintegrarCancelacion,
    reintegrarDevolucion,
    registrarEntrada,
    registrarAjuste,
    listarMovimientos,
    resumenVentasPorProducto,
    listarAlertas,
    marcarAlertasLeidas,
    movimientosVentaDelPedido
};
