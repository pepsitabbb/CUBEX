/* =====================================================================
   CUBEX - SERVICIO DE PEDIDOS

   Flujo de un pedido:
     pendiente  -> (pago aprobado) -> procesando -> confirmado
     pendiente  -> cancelado            (el cliente o el personal)
     confirmado -> cancelado            (solo ADMIN, si aún no se envió)

   - El precio de cada producto se toma del servidor (con oferta activa)
     y se guarda en detalle_carrito.precio_unitario.
   - El inventario se descuenta UNA sola vez, al confirmar el pago, a
     través del microservicio de inventario (fuente confiable del stock).
   - "procesando" es un candado lógico: impide que dos confirmaciones
     simultáneas del mismo pedido avancen al mismo tiempo.
   ===================================================================== */

const pool = require('../config/database');
const inventario = require('./inventario.cliente');

const MINUTOS_CANDADO = 2;

class ErrorPedido extends Error {
    constructor(status, codigo, mensaje, detalle = null) {
        super(mensaje);
        this.status = status;
        this.codigo = codigo;
        this.detalle = detalle;
    }
}

const PRECIO_VENTA_SQL = `
    CASE WHEN o.activa = 1 THEN o.precio_oferta ELSE pr.precio END
`;

function estadoDe(pedido) {
    return String(pedido?.estado || '').trim().toLowerCase();
}

function redondear(valor) {
    return Math.round(Number(valor) * 100) / 100;
}

// ========================================
// CONSULTAS
// ========================================

async function obtenerArticulos(idsCarrito, conexion = pool) {
    if (!idsCarrito.length) {
        return [];
    }

    const [filas] = await conexion.query(`
        SELECT
            dc.id_carrito,
            dc.id_producto,
            pr.nombre,
            pr.imagen,
            SUM(dc.cantidad) AS cantidad,
            MAX(COALESCE(dc.precio_unitario, pr.precio)) AS precio_unitario
        FROM detalle_carrito dc
        INNER JOIN productos pr
            ON pr.id = dc.id_producto
        WHERE dc.id_carrito IN (?)
        GROUP BY dc.id_carrito, dc.id_producto, pr.nombre, pr.imagen
        ORDER BY pr.nombre
    `, [idsCarrito]);

    return filas.map(fila => ({
        id_carrito: Number(fila.id_carrito),
        id_producto: Number(fila.id_producto),
        nombre: fila.nombre,
        imagen: fila.imagen,
        cantidad: Number(fila.cantidad),
        precio_unitario: Number(fila.precio_unitario),
        subtotal: redondear(Number(fila.cantidad) * Number(fila.precio_unitario))
    }));
}

function adjuntarArticulos(pedidos, articulos) {
    return pedidos.map(pedido => {
        const propios = articulos.filter(a => a.id_carrito === Number(pedido.id_carrito));
        const totalCalculado = redondear(propios.reduce((suma, a) => suma + a.subtotal, 0));

        return {
            ...pedido,
            total: pedido.total !== null && pedido.total !== undefined
                ? Number(pedido.total)
                : totalCalculado,
            productos: propios.map(({ id_carrito, ...resto }) => resto),
            total_articulos: propios.reduce((suma, a) => suma + a.cantidad, 0)
        };
    });
}

const COLUMNAS_PEDIDO = `
    p.id,
    p.id_carrito,
    p.id_cliente,
    p.id_direccion,
    p.id_tipo_pago,
    p.fecha,
    p.estado,
    p.total,
    p.fecha_confirmacion,
    p.fecha_cancelacion,
    p.motivo_cancelacion,
    v.id AS id_venta,
    c.id_usuario,
    COALESCE(NULLIF(TRIM(u.nombre_completo), ''), u.nombre_usuario) AS cliente_nombre,
    u.email AS cliente_correo,
    d.calle_numero,
    d.colonia,
    d.ciudad,
    d.codigo_postal,
    d.referencias
`;

const UNIONES_PEDIDO = `
    FROM pedidos p
    INNER JOIN clientes c ON c.id = p.id_cliente
    LEFT JOIN usuarios u ON u.id = c.id_usuario
    LEFT JOIN direcciones d ON d.id = p.id_direccion
    LEFT JOIN ventas v ON v.id_pedido = p.id
`;

// Todos los pedidos (personal autorizado).
const obtenerPedidos = async ({ estado = '', busqueda = '' } = {}) => {
    const condiciones = [];
    const valores = [];

    if (estado) {
        condiciones.push('LOWER(p.estado) = ?');
        valores.push(String(estado).toLowerCase());
    }

    if (busqueda) {
        condiciones.push(`(
            CAST(p.id AS CHAR) = ?
            OR u.nombre_usuario LIKE ?
            OR u.nombre_completo LIKE ?
            OR u.email LIKE ?
        )`);
        const patron = `%${busqueda}%`;
        valores.push(String(busqueda).replace(/^#/, ''), patron, patron, patron);
    }

    const [pedidos] = await pool.query(`
        SELECT ${COLUMNAS_PEDIDO}
        ${UNIONES_PEDIDO}
        ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
        ORDER BY p.fecha DESC, p.id DESC
        LIMIT 500
    `, valores);

    const articulos = await obtenerArticulos(pedidos.map(p => p.id_carrito));
    return adjuntarArticulos(pedidos, articulos);
};

// Pedidos de un usuario (solo los suyos).
const obtenerPedidosPorUsuario = async (idUsuario) => {
    const [pedidos] = await pool.query(`
        SELECT ${COLUMNAS_PEDIDO}
        ${UNIONES_PEDIDO}
        WHERE c.id_usuario = ?
        ORDER BY p.fecha DESC, p.id DESC
    `, [idUsuario]);

    const articulos = await obtenerArticulos(pedidos.map(p => p.id_carrito));
    return adjuntarArticulos(pedidos, articulos);
};

const obtenerPedido = async (id, conexion = pool) => {
    const [pedidos] = await conexion.query(
        'SELECT * FROM pedidos WHERE id = ?',
        [id]
    );

    return pedidos[0] || null;
};

const obtenerPedidoCompleto = async (id) => {
    const [pedidos] = await pool.query(`
        SELECT ${COLUMNAS_PEDIDO}
        ${UNIONES_PEDIDO}
        WHERE p.id = ?
    `, [id]);

    if (!pedidos.length) {
        return null;
    }

    const articulos = await obtenerArticulos([pedidos[0].id_carrito]);
    return adjuntarArticulos(pedidos, articulos)[0];
};

// ========================================
// VALIDAR EXISTENCIAS (lectura)
// ========================================

async function existenciasDe(idsProducto, conexion = pool) {
    const [filas] = await conexion.query(`
        SELECT
            pr.id,
            pr.nombre,
            pr.activo,
            COALESCE(s.stock_actual, 0) AS stock_actual,
            ${PRECIO_VENTA_SQL} AS precio_venta
        FROM productos pr
        LEFT JOIN stock s ON s.id_producto = pr.id
        LEFT JOIN ofertas o ON o.id_producto = pr.id
        WHERE pr.id IN (?)
    `, [idsProducto]);

    return new Map(filas.map(fila => [Number(fila.id), fila]));
}

function compararExistencias(articulos, existencias) {
    const faltantes = [];

    for (const articulo of articulos) {
        const fila = existencias.get(articulo.id_producto);
        const disponible = fila && Number(fila.activo) === 1
            ? Math.max(0, Number(fila.stock_actual))
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

    return faltantes;
}

const validarStockPedido = async (id) => {
    const pedido = await obtenerPedido(id);

    if (!pedido) {
        return null;
    }

    const articulos = await obtenerArticulos([pedido.id_carrito]);
    const existencias = await existenciasDe(articulos.map(a => a.id_producto));
    const faltantes = compararExistencias(articulos, existencias);

    return {
        id_pedido: Number(pedido.id),
        estado: estadoDe(pedido),
        disponible: faltantes.length === 0,
        faltantes
    };
};

// ========================================
// REGISTRAR UN PEDIDO PENDIENTE
// ========================================

const registrarPedido = async ({ idUsuario, idDireccion, productos, claveIdempotencia = null }) => {
    // Agrupar productos repetidos y validar cantidades.
    const agrupados = new Map();

    for (const producto of productos) {
        const idProducto = Number(producto?.id ?? producto?.id_producto);
        const cantidad = Number(producto?.cantidad);

        if (
            !Number.isInteger(idProducto) || idProducto <= 0 ||
            !Number.isInteger(cantidad) || cantidad <= 0 || cantidad > 1000
        ) {
            throw new ErrorPedido(400, 'CANTIDAD_INVALIDA', 'Hay productos o cantidades no válidas.');
        }

        agrupados.set(idProducto, (agrupados.get(idProducto) || 0) + cantidad);
    }

    const articulos = [...agrupados.entries()]
        .map(([id_producto, cantidad]) => ({ id_producto, cantidad }))
        .sort((a, b) => a.id_producto - b.id_producto);

    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();

        const [clientes] = await conexion.query(
            'SELECT id FROM clientes WHERE id_usuario = ? LIMIT 1',
            [idUsuario]
        );

        if (clientes.length === 0) {
            throw new ErrorPedido(403, 'SIN_PERFIL_CLIENTE', 'Tu cuenta no tiene un perfil de cliente.');
        }

        const idCliente = clientes[0].id;

        // Evitar pedidos duplicados por doble clic o reintentos.
        if (claveIdempotencia) {
            const [repetidos] = await conexion.query(
                `SELECT id FROM pedidos
                 WHERE id_cliente = ? AND clave_idempotencia = ?
                 LIMIT 1`,
                [idCliente, claveIdempotencia]
            );

            if (repetidos.length > 0) {
                await conexion.commit();
                return { pedido: await obtenerPedidoCompleto(repetidos[0].id), repetido: true };
            }
        }

        const [direcciones] = await conexion.query(
            `SELECT id FROM direcciones
             WHERE id = ? AND id_cliente = ?
             LIMIT 1`,
            [idDireccion, idCliente]
        );

        if (direcciones.length === 0) {
            throw new ErrorPedido(400, 'DOMICILIO_INVALIDO', 'El domicilio no existe o no pertenece a tu cuenta.');
        }

        const [tiposPago] = await conexion.query(
            `SELECT id FROM tipos_pago WHERE nombre = 'Tarjeta' LIMIT 1`
        );

        if (tiposPago.length === 0) {
            throw new ErrorPedido(500, 'CONFIGURACION', 'No está registrado el tipo de pago Tarjeta.');
        }

        // Validar existencias reales y obtener precios del servidor.
        const existencias = await existenciasDe(articulos.map(a => a.id_producto), conexion);
        const faltantes = compararExistencias(articulos, existencias);

        if (faltantes.length > 0) {
            throw new ErrorPedido(
                409,
                'STOCK_INSUFICIENTE',
                'Algunos productos de tu carrito ya no tienen existencias suficientes. Actualiza tu carrito.',
                faltantes
            );
        }

        const [nuevoCarrito] = await conexion.query(
            `INSERT INTO carrito (id_cliente, estado) VALUES (?, 'cerrado')`,
            [idCliente]
        );

        const idCarrito = nuevoCarrito.insertId;
        let total = 0;

        for (const articulo of articulos) {
            const precio = Number(existencias.get(articulo.id_producto).precio_venta);
            total += precio * articulo.cantidad;

            await conexion.query(
                `INSERT INTO detalle_carrito
                    (id_carrito, id_producto, cantidad, precio_unitario)
                 VALUES (?, ?, ?, ?)`,
                [idCarrito, articulo.id_producto, articulo.cantidad, precio]
            );
        }

        const [resultado] = await conexion.query(
            `INSERT INTO pedidos
                (id_carrito, id_cliente, id_direccion, id_tipo_pago,
                 id_tarjeta, fecha, estado, total, clave_idempotencia)
             VALUES (?, ?, ?, ?, NULL, NOW(), 'pendiente', ?, ?)`,
            [idCarrito, idCliente, idDireccion, tiposPago[0].id, redondear(total), claveIdempotencia]
        );

        await conexion.commit();

        return { pedido: await obtenerPedidoCompleto(resultado.insertId), repetido: false };
    } catch (error) {
        await conexion.rollback();

        if (error && error.code === 'ER_DUP_ENTRY' && claveIdempotencia) {
            // Dos solicitudes simultáneas con la misma clave.
            const [repetidos] = await pool.query(
                `SELECT p.id FROM pedidos p
                 INNER JOIN clientes c ON c.id = p.id_cliente
                 WHERE c.id_usuario = ? AND p.clave_idempotencia = ? LIMIT 1`,
                [idUsuario, claveIdempotencia]
            );

            if (repetidos.length) {
                return { pedido: await obtenerPedidoCompleto(repetidos[0].id), repetido: true };
            }
        }

        throw error;
    } finally {
        conexion.release();
    }
};

// ========================================
// CONFIRMAR PEDIDO DESPUÉS DEL PAGO
// ========================================

async function liberarCandado(id) {
    await pool.query(
        `UPDATE pedidos
         SET estado = 'pendiente', procesando_desde = NULL
         WHERE id = ? AND LOWER(estado) = 'procesando'`,
        [id]
    );
}

const confirmarPago = async (id, { referenciaPago = null, idUsuario = null } = {}) => {
    // 1. Tomar el pedido: solo una solicitud puede pasar de "pendiente"
    //    a "procesando". Un candado vencido (servicio caído a mitad del
    //    proceso) puede retomarse porque el inventario es idempotente.
    const [toma] = await pool.query(
        `UPDATE pedidos
         SET estado = 'procesando', procesando_desde = NOW()
         WHERE id = ?
           AND (
                LOWER(estado) = 'pendiente'
                OR (
                    LOWER(estado) = 'procesando'
                    AND (procesando_desde IS NULL
                         OR procesando_desde < NOW() - INTERVAL ${MINUTOS_CANDADO} MINUTE)
                )
           )`,
        [id]
    );

    if (toma.affectedRows === 0) {
        const pedido = await obtenerPedido(id);

        if (!pedido) {
            throw new ErrorPedido(404, 'NO_ENCONTRADO', 'Pedido no encontrado.');
        }

        const estado = estadoDe(pedido);

        if (estado === 'confirmado') {
            return { pedido: await obtenerPedidoCompleto(id), ya_confirmado: true };
        }

        if (estado === 'procesando') {
            throw new ErrorPedido(409, 'EN_PROCESO', 'El pago de este pedido ya se está procesando.');
        }

        if (estado === 'cancelado') {
            throw new ErrorPedido(409, 'PEDIDO_CANCELADO', 'No se puede confirmar un pedido cancelado.');
        }

        throw new ErrorPedido(409, 'ESTADO_NO_VALIDO', `El pedido está en estado "${estado}".`);
    }

    let pedido;

    try {
        pedido = await obtenerPedido(id);

        if (referenciaPago) {
            const [otros] = await pool.query(
                'SELECT id FROM pedidos WHERE referencia_pago = ? AND id <> ? LIMIT 1',
                [referenciaPago, id]
            );

            if (otros.length > 0) {
                throw new ErrorPedido(409, 'PAGO_YA_UTILIZADO', 'Esta transacción ya se utilizó en otro pedido.');
            }
        }

        const articulos = await obtenerArticulos([pedido.id_carrito]);

        if (articulos.length === 0) {
            throw new ErrorPedido(409, 'PEDIDO_VACIO', 'El pedido no tiene productos.');
        }

        // 2. Descontar inventario (atómico e idempotente en el servicio 3005).
        try {
            await inventario.descontarVenta(
                id,
                articulos.map(a => ({ id_producto: a.id_producto, cantidad: a.cantidad })),
                idUsuario
            );
        } catch (error) {
            if (error.status === 409 && error.codigo === 'STOCK_INSUFICIENTE') {
                await pool.query(
                    `UPDATE pedidos
                     SET estado = 'cancelado',
                         procesando_desde = NULL,
                         fecha_cancelacion = NOW(),
                         motivo_cancelacion = 'Sin existencias suficientes al confirmar el pago'
                     WHERE id = ? AND LOWER(estado) = 'procesando'`,
                    [id]
                );

                throw new ErrorPedido(
                    409,
                    'STOCK_INSUFICIENTE',
                    'Ya no hay existencias suficientes para este pedido. No se realizó ningún cargo definitivo.',
                    error.detalle
                );
            }

            throw error;
        }

        // 3. Registrar la venta y confirmar el pedido en una transacción.
        const total = redondear(articulos.reduce((suma, a) => suma + a.subtotal, 0));
        const conexion = await pool.getConnection();

        try {
            await conexion.beginTransaction();

            await conexion.query(
                `INSERT INTO ventas (id_pedido, id_cliente, fecha, total, estado, origen)
                 VALUES (?, ?, NOW(), ?, 'confirmada', 'tienda')
                 ON DUPLICATE KEY UPDATE total = VALUES(total), estado = 'confirmada'`,
                [id, pedido.id_cliente, total]
            );

            const [ventas] = await conexion.query(
                'SELECT id FROM ventas WHERE id_pedido = ?',
                [id]
            );

            const idVenta = ventas[0].id;

            for (const articulo of articulos) {
                await conexion.query(
                    `INSERT INTO detalle_ventas (id_venta, id_producto, cantidad, precio_unitario)
                     VALUES (?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                        cantidad = VALUES(cantidad),
                        precio_unitario = VALUES(precio_unitario)`,
                    [idVenta, articulo.id_producto, articulo.cantidad, articulo.precio_unitario]
                );
            }

            await conexion.query(
                `UPDATE pedidos
                 SET estado = 'confirmado',
                     procesando_desde = NULL,
                     fecha_confirmacion = NOW(),
                     total = ?,
                     referencia_pago = COALESCE(?, referencia_pago)
                 WHERE id = ? AND LOWER(estado) = 'procesando'`,
                [total, referenciaPago, id]
            );

            await conexion.commit();
        } catch (error) {
            await conexion.rollback();
            throw error;
        } finally {
            conexion.release();
        }

        return { pedido: await obtenerPedidoCompleto(id), ya_confirmado: false };
    } catch (error) {
        // Si no se completó, el pedido vuelve a "pendiente" para poder
        // reintentarse (el inventario no se descontará dos veces).
        await liberarCandado(id).catch(() => {});
        throw error;
    }
};

// ========================================
// CANCELAR PEDIDO
// ========================================

const ESTADOS_ENVIO_CANCELABLES = ['pendiente', 'preparando', 'cancelado'];

const cancelarPedido = async (id, { motivo = null, idUsuario = null, soloPendiente = false } = {}) => {
    const conexion = await pool.getConnection();
    let yaCancelado = false;

    try {
        await conexion.beginTransaction();

        const [filas] = await conexion.query(
            'SELECT * FROM pedidos WHERE id = ? FOR UPDATE',
            [id]
        );

        if (filas.length === 0) {
            throw new ErrorPedido(404, 'NO_ENCONTRADO', 'Pedido no encontrado.');
        }

        const estado = estadoDe(filas[0]);

        if (estado === 'cancelado') {
            yaCancelado = true;
        } else {
            if (estado === 'procesando') {
                throw new ErrorPedido(409, 'EN_PROCESO', 'El pago de este pedido se está procesando. Intenta en unos minutos.');
            }

            if (soloPendiente && estado !== 'pendiente') {
                throw new ErrorPedido(
                    409,
                    'NO_CANCELABLE',
                    'Solo puedes cancelar pedidos pendientes de pago. Para un pedido pagado solicita una devolución.'
                );
            }

            const [ventas] = await conexion.query(
                'SELECT id FROM ventas WHERE id_pedido = ? FOR UPDATE',
                [id]
            );

            if (ventas.length > 0) {
                const [envios] = await conexion.query(
                    'SELECT id, estado FROM envios WHERE id_venta = ? FOR UPDATE',
                    [ventas[0].id]
                );

                if (envios.length > 0) {
                    const estadoEnvio = String(envios[0].estado || '').toLowerCase();

                    if (!ESTADOS_ENVIO_CANCELABLES.includes(estadoEnvio)) {
                        throw new ErrorPedido(
                            409,
                            'YA_ENVIADO',
                            'El pedido ya salió a envío; no puede cancelarse. Gestiona una devolución.'
                        );
                    }

                    if (estadoEnvio !== 'cancelado') {
                        await conexion.query(
                            `UPDATE envios SET estado = 'cancelado' WHERE id = ?`,
                            [envios[0].id]
                        );

                        await conexion.query(
                            `INSERT INTO historial_envios (id_envio, estado, descripcion, id_usuario)
                             VALUES (?, 'cancelado', 'Envío cancelado por cancelación del pedido', ?)`,
                            [envios[0].id, idUsuario]
                        );
                    }
                }

                await conexion.query(
                    `UPDATE ventas SET estado = 'cancelada' WHERE id = ?`,
                    [ventas[0].id]
                );
            }

            await conexion.query(
                `UPDATE pedidos
                 SET estado = 'cancelado',
                     procesando_desde = NULL,
                     fecha_cancelacion = NOW(),
                     motivo_cancelacion = ?
                 WHERE id = ?`,
                [motivo ? String(motivo).slice(0, 255) : 'Cancelado', id]
            );
        }

        await conexion.commit();
    } catch (error) {
        await conexion.rollback();
        throw error;
    } finally {
        conexion.release();
    }

    // Reintegrar existencias SOLO de lo que realmente se descontó.
    // La operación es idempotente: repetir la cancelación no duplica stock.
    let reintegro;

    try {
        reintegro = await inventario.reintegrarCancelacion(id, motivo, idUsuario);
    } catch (error) {
        reintegro = {
            reintegrado: false,
            pendiente: true,
            mensaje: `${error.message} Repite la cancelación para reintegrar el stock.`
        };
    }

    return {
        pedido: await obtenerPedidoCompleto(id),
        ya_cancelado: yaCancelado,
        reintegro
    };
};

module.exports = {
    ErrorPedido,
    obtenerPedidos,
    obtenerPedidosPorUsuario,
    obtenerPedido,
    obtenerPedidoCompleto,
    validarStockPedido,
    registrarPedido,
    confirmarPago,
    cancelarPedido
};
