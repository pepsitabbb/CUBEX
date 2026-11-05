/* Pruebas de lógica de inventario/pedidos con los microservicios REALES
   (Express) y MySQL simulado con SQLite. Ejecutar:
       node pruebas.js                                                   */

const path = require('path');
const fs = require('fs');
const Module = require('module');
const { DatabaseSync } = require('node:sqlite');
const simulado = require('./mysql2-simulado');

const RAIZ = path.resolve(__dirname, '../..');
const jwt = require(path.join(RAIZ, 'microservicio-login/node_modules/jsonwebtoken'));

const db = new DatabaseSync(':memory:');
db.exec(fs.readFileSync(path.join(__dirname, 'esquema.sql'), 'utf8'));
const pool = simulado.crear(db);

const cargaOriginal = Module._load;
Module._load = function (solicitud, padre, esPrincipal) {
    if (solicitud === 'mysql2/promise') return { createPool: () => pool };
    return cargaOriginal.apply(this, arguments);
};

Object.assign(process.env, {
    JWT_SECRET: 'p'.repeat(48),
    JWT_ISSUER: 'microservicio-login',
    CUBEX_SERVICE_KEY: 'clave-interna-pruebas-0123456789',
    INVENTARIO_API_URL: 'http://localhost:3105/api/inventario'
});

process.env.PORT = '3105';
require(path.join(RAIZ, 'inventario-service-main/src/app.js'));
process.env.PORT = '3111';
require(path.join(RAIZ, 'registro-pedidos-service/server.js'));

const INV = 'http://localhost:3105/api';
const PED = 'http://localhost:3111/api/Pedidos';
const CLAVE = process.env.CUBEX_SERVICE_KEY;

const token = (sub, rol) => jwt.sign({ sub: String(sub), rol, nombreUsuario: 'u' }, process.env.JWT_SECRET, {
    expiresIn: '15m', issuer: 'microservicio-login'
});

const T = { diego: token(10, 'CLIENTE'), fabi: token(11, 'CLIENTE'), admin: token(1, 'ADMIN') };

async function http(metodo, url, { tk, cuerpo, interno } = {}) {
    const cabeceras = { 'Content-Type': 'application/json' };
    if (tk) cabeceras.Authorization = `Bearer ${tk}`;
    if (interno) cabeceras['X-Servicio-Clave'] = CLAVE;
    const r = await fetch(url, { method: metodo, headers: cabeceras, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    return { status: r.status, datos: await r.json().catch(() => ({})) };
}

const uno = sql => db.prepare(sql).get();
const stock = id => uno(`SELECT stock_actual AS s FROM stock WHERE id_producto=${id}`).s;
const movs = (id, tipo) => uno(`SELECT COUNT(*) AS n FROM movimientos_inventario WHERE id_producto=${id}${tipo ? ` AND tipo='${tipo}'` : ''}`).n;

let idProducto = 100;
function nuevoProducto(nombre, existencias, precio = 50) {
    const id = ++idProducto;
    db.prepare('INSERT INTO productos (id,nombre,costo,precio) VALUES (?,?,?,?)').run(id, nombre, 10, precio);
    db.prepare('INSERT INTO stock (id_producto,stock_actual,stock_minimo,stock_maximo) VALUES (?,?,?,?)').run(id, existencias, 2, 20);
    return id;
}

async function crearPedido(tk, idDir, articulos, clave) {
    return http('POST', PED, { tk, cuerpo: { id_direccion: idDir, productos: articulos, ...(clave ? { clave_idempotencia: clave } : {}) } });
}

const confirmar = (id, ref) => http('PATCH', `${PED}/${id}/confirmar-pago`, { interno: true, cuerpo: ref ? { referencia_pago: ref } : {} });

const resultados = [];
function verificar(escenario, descripcion, condicion, detalle = '') {
    resultados.push({ escenario, descripcion, ok: Boolean(condicion), detalle });
}

async function principal() {
    await new Promise(r => setTimeout(r, 300));

    // ---------------- Escenario 1: compra normal ----------------
    const p1 = nuevoProducto('Cubo Rubik 3x3', 10);
    let r = await crearPedido(T.diego, 1, [{ id: p1, cantidad: 3 }]);
    verificar(1, 'Crear pedido no descuenta stock', r.status === 201 && stock(p1) === 10, `HTTP ${r.status}, stock ${stock(p1)}`);
    const ped1 = r.datos.datos.id;
    r = await confirmar(ped1, 'PAGO-1');
    verificar(1, 'Confirmar pago: stock 10 -> 7', r.status === 200 && stock(p1) === 7, `HTTP ${r.status}, stock ${stock(p1)}`);
    verificar(1, 'Se registró 1 movimiento de venta y la venta', movs(p1, 'venta') === 1 &&
        uno(`SELECT COUNT(*) n FROM ventas WHERE id_pedido=${ped1}`).n === 1, `movimientos ${movs(p1, 'venta')}`);
    r = await crearPedido(T.diego, 1, [{ id: p1, cantidad: 3 }]);
    await confirmar(r.datos.datos.id);
    verificar(1, 'Segunda compra de 3: stock 7 -> 4', stock(p1) === 4, `stock ${stock(p1)}`);

    // ---------------- Escenario 2: agotamiento ----------------
    const p2 = nuevoProducto('Pyraminx', 2);
    let cat = await http('GET', `${INV}/productos/catalogo`);
    verificar(2, 'Producto con stock aparece en el catálogo', cat.datos.data.some(p => p.id === p2));
    r = await crearPedido(T.diego, 1, [{ id: p2, cantidad: 2 }]);
    await confirmar(r.datos.datos.id);
    cat = await http('GET', `${INV}/productos/catalogo`);
    verificar(2, 'Stock 2 - 2 = 0', stock(p2) === 0, `stock ${stock(p2)}`);
    verificar(2, 'Producto agotado oculto del catálogo público', !cat.datos.data.some(p => p.id === p2));
    const lista = await http('GET', `${INV}/productos`);
    verificar(2, 'GET /api/productos público tampoco lo muestra', !lista.datos.data.some(p => p.id === p2));
    const det = await http('GET', `${INV}/productos/${p2}`);
    verificar(2, 'Detalle directo responde "no disponible"', det.status === 200 && det.datos.data.disponible === false, det.datos.message);
    const busq = await http('GET', `${INV}/productos/catalogo/buscar?q=pyra`);
    verificar(2, 'Búsqueda informa que no está disponible', busq.datos.no_disponibles.some(p => p.id === p2) && !busq.datos.data.some(p => p.id === p2));
    const alerta = uno(`SELECT COUNT(*) n FROM alertas_inventario WHERE id_producto=${p2} AND tipo='agotado'`).n;
    verificar(2, 'Se generó alerta de agotado', alerta === 1);
    r = await crearPedido(T.diego, 1, [{ id: p2, cantidad: 1 }]);
    verificar(2, 'Comprar un agotado por API directa es rechazado', r.status === 409 && r.datos.codigo === 'STOCK_INSUFICIENTE', `HTTP ${r.status}`);

    // ---------------- Escenario 3: compra superior al stock ----------------
    const p3 = nuevoProducto('Megaminx', 3);
    r = await crearPedido(T.diego, 1, [{ id: p3, cantidad: 5 }]);
    verificar(3, 'Pedido de 5 con stock 3 rechazado (409)', r.status === 409 && stock(p3) === 3, `HTTP ${r.status}, stock ${stock(p3)}`);
    r = await http('POST', `${INV}/inventario/ventas/salida`, { interno: true, cuerpo: { id_pedido: ped1 + 999, articulos: [{ id_producto: p3, cantidad: 5 }] } });
    verificar(3, 'Salida directa al inventario por 5 rechazada', r.status === 409 || r.status === 500, `HTTP ${r.status}`);
    verificar(3, 'Stock sin cambios (3)', stock(p3) === 3 && movs(p3) === 0);
    // El stock baja entre la creación del pedido y el pago.
    r = await crearPedido(T.diego, 1, [{ id: p3, cantidad: 3 }]);
    const ped3 = r.datos.datos.id;
    await http('POST', `${INV}/inventario/ajustes`, { tk: T.admin, cuerpo: { id_producto: p3, stock_nuevo: 1, motivo: 'Conteo físico' } });
    r = await confirmar(ped3);
    const estado3 = uno(`SELECT estado FROM pedidos WHERE id=${ped3}`).estado;
    verificar(3, 'Al pagar sin stock suficiente: 409 y pedido cancelado', r.status === 409 && estado3 === 'cancelado', `HTTP ${r.status}, ${estado3}`);
    verificar(3, 'Stock queda en 1 (sin descuento)', stock(p3) === 1, `stock ${stock(p3)}`);

    // ---------------- Escenario 4: pago fallido ----------------
    const p4 = nuevoProducto('Skewb', 10);
    r = await crearPedido(T.diego, 1, [{ id: p4, cantidad: 4 }]);
    const ped4 = r.datos.datos.id;
    // Pago rechazado: el servicio de pagos NO llama a confirmar-pago.
    verificar(4, 'Pago fallido: pedido sigue pendiente y stock 10', uno(`SELECT estado FROM pedidos WHERE id=${ped4}`).estado === 'pendiente' && stock(p4) === 10);
    r = await http('PATCH', `${PED}/${ped4}/confirmar-pago`, { tk: T.diego });
    verificar(4, 'El cliente no puede confirmar sin pagar (403)', r.status === 403 && stock(p4) === 10, `HTTP ${r.status}`);

    // ---------------- Escenario 5: compra duplicada ----------------
    const p5 = nuevoProducto('Rubik 4x4', 10);
    r = await crearPedido(T.diego, 1, [{ id: p5, cantidad: 2 }], 'claveDobleClic0001');
    const r5b = await crearPedido(T.diego, 1, [{ id: p5, cantidad: 2 }], 'claveDobleClic0001');
    verificar(5, 'Doble envío del pedido con la misma clave = 1 pedido', r5b.status === 200 && r5b.datos.repetido === true && r5b.datos.datos.id === r.datos.datos.id);
    const ped5 = r.datos.datos.id;
    const dobles = await Promise.all([confirmar(ped5, 'PAGO-5'), confirmar(ped5, 'PAGO-5'), confirmar(ped5, 'PAGO-5')]);
    await confirmar(ped5, 'PAGO-5');
    verificar(5, 'Confirmaciones simultáneas/repetidas: stock 10 -> 8 una vez', stock(p5) === 8 && movs(p5, 'venta') === 1,
        `stock ${stock(p5)}, movimientos ${movs(p5, 'venta')}, HTTP ${dobles.map(d => d.status).join('/')}`);
    verificar(5, 'Un solo registro de venta', uno(`SELECT COUNT(*) n FROM ventas WHERE id_pedido=${ped5}`).n === 1);
    r = await http('POST', `${INV}/inventario/ventas/salida`, { interno: true, cuerpo: { id_pedido: ped5, articulos: [{ id_producto: p5, cantidad: 2 }] } });
    verificar(5, 'Repetir la salida al inventario no descuenta de nuevo', r.status === 200 && r.datos.datos.ya_aplicado === true && stock(p5) === 8);

    // ---------------- Escenario 6: compras simultáneas ----------------
    const p6 = nuevoProducto('Super Floppy', 1);
    const a = await crearPedido(T.diego, 1, [{ id: p6, cantidad: 1 }]);
    const b = await crearPedido(T.fabi, 5, [{ id: p6, cantidad: 1 }]);
    const [ca, cb] = await Promise.all([confirmar(a.datos.datos.id), confirmar(b.datos.datos.id)]);
    const confirmados = [ca, cb].filter(x => x.status === 200).length;
    verificar(6, 'Dos clientes por la última unidad: solo 1 confirmado', confirmados === 1, `HTTP ${ca.status}/${cb.status}`);
    verificar(6, 'Stock final 0, nunca negativo', stock(p6) === 0, `stock ${stock(p6)}`);

    // ---------------- Escenario 7: cancelación ----------------
    r = await http('PATCH', `${PED}/${ped5}/estado`, { tk: T.admin, cuerpo: { estado: 'cancelado', motivo: 'Cliente lo solicitó' } });
    verificar(7, 'Cancelar pedido confirmado reintegra 2 (8 -> 10)', r.status === 200 && stock(p5) === 10, `HTTP ${r.status}, stock ${stock(p5)}`);
    await http('PATCH', `${PED}/${ped5}/estado`, { tk: T.admin, cuerpo: { estado: 'cancelado' } });
    await http('POST', `${INV}/inventario/ventas/cancelacion`, { interno: true, cuerpo: { id_pedido: ped5 } });
    verificar(7, 'Repetir la cancelación no reintegra dos veces', stock(p5) === 10 && movs(p5, 'cancelacion') === 1, `stock ${stock(p5)}`);
    verificar(7, 'La venta queda cancelada', uno(`SELECT estado FROM ventas WHERE id_pedido=${ped5}`).estado === 'cancelada');
    r = await http('PATCH', `${PED}/${ped4}/estado`, { tk: T.admin, cuerpo: { estado: 'cancelado' } });
    verificar(7, 'Cancelar un pedido NO pagado no cambia el stock', r.status === 200 && stock(p4) === 10 && movs(p4) === 0);
    r = await http('PATCH', `${PED}/${ped5}/estado`, { tk: T.admin, cuerpo: { estado: 'confirmado' } });
    verificar(7, 'Un pedido cancelado no puede volver a confirmarse', r.status === 409 && stock(p5) === 10, `HTTP ${r.status}`);
    // No se cancela si ya salió a envío.
    const p7 = nuevoProducto('Rainbow Cube', 5);
    r = await crearPedido(T.diego, 1, [{ id: p7, cantidad: 1 }]);
    const ped7 = r.datos.datos.id;
    await confirmar(ped7);
    const venta7 = uno(`SELECT id FROM ventas WHERE id_pedido=${ped7}`).id;
    db.prepare(`INSERT INTO envios (id_venta,id_direccion,paqueteria,num_guia,estado) VALUES (?,1,'DHL','G-777','en_transito')`).run(venta7);
    r = await http('PATCH', `${PED}/${ped7}/estado`, { tk: T.admin, cuerpo: { estado: 'cancelado' } });
    verificar(7, 'Pedido ya enviado no se cancela (usar devolución)', r.status === 409 && stock(p7) === 4, `HTTP ${r.status}`);

    // ---------------- Escenario 8: devolución ----------------
    db.prepare('INSERT INTO devoluciones_venta (id,id_venta,id_producto,cantidad) VALUES (50,?,?,1)').run(venta7, p7);
    r = await http('POST', `${INV}/inventario/devoluciones/reintegro`, { interno: true, cuerpo: { id_devolucion: 50, id_producto: p7, cantidad: 1, id_pedido: ped7 } });
    verificar(8, 'Producto recibido vendible: stock 4 -> 5', r.status === 200 && stock(p7) === 5, `HTTP ${r.status}, stock ${stock(p7)}`);
    await http('POST', `${INV}/inventario/devoluciones/reintegro`, { interno: true, cuerpo: { id_devolucion: 50, id_producto: p7, cantidad: 1 } });
    verificar(8, 'Repetir el reintegro de la misma devolución no suma dos veces', stock(p7) === 5 && movs(p7, 'devolucion') === 1);

    // ---------------- Inventario: entradas, ajustes, consultas ----------------
    r = await http('POST', `${INV}/inventario/entradas`, { tk: T.admin, cuerpo: { id_producto: p2, cantidad: 10, motivo: 'Reposición', clave_operacion: 'entrada-xyz-1' } });
    verificar('Inv', 'Entrada de mercancía aumenta stock (0 -> 10)', r.status === 201 && stock(p2) === 10, `HTTP ${r.status}`);
    r = await http('POST', `${INV}/inventario/entradas`, { tk: T.admin, cuerpo: { id_producto: p2, cantidad: 10, clave_operacion: 'entrada-xyz-1' } });
    verificar('Inv', 'Entrada repetida (misma clave) rechazada', r.status === 409 && stock(p2) === 10);
    cat = await http('GET', `${INV}/productos/catalogo`);
    verificar('Inv', 'Con existencias el producto vuelve al catálogo', cat.datos.data.some(p => p.id === p2));
    r = await http('POST', `${INV}/inventario/ajustes`, { tk: T.admin, cuerpo: { id_producto: p2, stock_nuevo: 7 } });
    verificar('Inv', 'Ajuste sin motivo rechazado', r.status === 400 && stock(p2) === 10);
    r = await http('GET', `${INV}/inventario/movimientos?id_producto=${p1}`, { tk: T.admin });
    const m = r.datos.datos || [];
    verificar('Inv', 'Historial con stock anterior y resultante', m.length === 2 && m.every(x => x.stock_anterior - x.cantidad === x.stock_resultante));
    r = await http('GET', `${INV}/inventario/alertas`, { tk: T.admin });
    verificar('Inv', 'Panel de alertas lista productos en riesgo', r.status === 200 && Array.isArray(r.datos.datos.productos_en_riesgo));
    r = await http('GET', `${INV}/inventario/ventas-por-producto`, { tk: T.admin });
    const v1 = (r.datos.datos || []).find(x => x.id_producto === p1);
    verificar('Inv', 'Unidades vendidas por producto (6 de Cubo Rubik)', v1 && Number(v1.vendidas) === 6, JSON.stringify(v1));
    r = await http('DELETE', `${INV}/productos/${p4}`, { tk: T.admin });
    cat = await http('GET', `${INV}/productos/catalogo`);
    verificar('Inv', 'Producto dado de baja no aparece aunque tenga stock', r.status === 200 && !cat.datos.data.some(p => p.id === p4) && stock(p4) === 10);
    r = await crearPedido(T.diego, 1, [{ id: p4, cantidad: 1 }]);
    verificar('Inv', 'Producto inactivo no puede comprarse por API', r.status === 409);
    const precio = cat.datos.data[0];
    verificar('Inv', 'El catálogo público no expone el costo', precio && !('costo' in precio));

    // ---------------- Compras a proveedores ----------------
    const antes = stock(p1);
    r = await http('POST', `${INV}/compras`, { tk: T.admin, cuerpo: { id_proveedor: 1, id_producto: p1, cantidad: 5, costo_unitario: 13 } });
    const movCompra = uno(`SELECT COUNT(*) n FROM movimientos_inventario WHERE id_producto=${p1} AND tipo='entrada' AND id_compra IS NOT NULL`).n;
    verificar('Inv', 'Compra a proveedor suma stock y registra entrada', r.status === 201 && stock(p1) === antes + 5 && movCompra === 1, `HTTP ${r.status} ${JSON.stringify(r.datos).slice(0, 120)}`);
    r = await http('POST', `${INV}/compras`, { tk: T.diego, cuerpo: { id_proveedor: 1, id_producto: p1, cantidad: 5, costo_unitario: 13 } });
    verificar('Seg', 'Un cliente no puede registrar compras (stock)', r.status === 403 && stock(p1) === antes + 5);

    // ---------------- Precio y ofertas ----------------
    const p9 = nuevoProducto('Skewb Ultimate', 10, 100);
    db.prepare('INSERT INTO ofertas (id_producto,porcentaje_descuento,precio_oferta,activa) VALUES (?,20,80,1)').run(p9);
    r = await crearPedido(T.diego, 1, [{ id: p9, cantidad: 2 }]);
    verificar('Precio', 'El total usa el precio de oferta del servidor (2 x 80)', r.datos.datos.total === 160, `total ${r.datos.datos.total}`);

    // ---------------- Seguridad de pedidos ----------------
    r = await http('GET', `${PED}/${ped1}`, { tk: T.fabi });
    verificar('Seg', 'Un cliente no ve el pedido de otro (404)', r.status === 404);
    r = await http('GET', `${PED}/mis-pedidos`, { tk: T.fabi });
    verificar('Seg', '"Mis pedidos" solo devuelve los propios', r.status === 200 && r.datos.datos.every(p => p.id_usuario === 11));
    r = await http('PATCH', `${PED}/${ped1}/cancelar`, { tk: T.fabi });
    verificar('Seg', 'Un cliente no puede cancelar el pedido de otro', r.status === 404);
    r = await http('PATCH', `${PED}/${ped1}/cancelar`, { tk: T.diego });
    verificar('Seg', 'El cliente no puede cancelar un pedido ya pagado', r.status === 409 && stock(p1) === 9);
    r = await crearPedido(T.fabi, 1, [{ id: p1, cantidad: 1 }]);
    verificar('Seg', 'No se puede usar el domicilio de otro cliente', r.status === 400);
    r = await http('PATCH', `${PED}/${ped1}/confirmar-pago`, { cuerpo: {}, tk: undefined });
    verificar('Seg', 'confirmar-pago sin autenticación rechazado', r.status === 401);

    // ---------------- Reporte ----------------
    let fallidas = 0;
    for (const x of resultados) {
        if (!x.ok) fallidas++;
        console.log(`${x.ok ? 'OK  ' : 'FALLA'} [${x.escenario}] ${x.descripcion}${x.ok ? '' : `  -> ${x.detalle}`}`);
    }
    console.log(`\n${resultados.length - fallidas}/${resultados.length} verificaciones correctas.`);
    process.exit(fallidas ? 1 : 0);
}

principal().catch(error => {
    console.error('Error en las pruebas:', error);
    process.exit(2);
});
