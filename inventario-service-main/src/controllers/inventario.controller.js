const inventario = require('../services/inventario.service');

function responderError(res, error, contexto) {
    if (error instanceof inventario.ErrorInventario) {
        return res.status(error.status).json({
            success: false,
            exitoso: false,
            codigo: error.codigo,
            message: error.message,
            mensaje: error.message,
            detalle: error.detalle
        });
    }

    if (error && error.errno === 3819) {
        // CHECK constraint: nunca permitir stock negativo.
        return res.status(409).json({
            success: false,
            exitoso: false,
            codigo: 'STOCK_INSUFICIENTE',
            message: 'La operación dejaría el inventario en negativo.',
            mensaje: 'La operación dejaría el inventario en negativo.'
        });
    }

    console.error(`Error en inventario (${contexto}):`, error);

    return res.status(500).json({
        success: false,
        exitoso: false,
        codigo: 'ERROR_INTERNO',
        message: 'Error interno del servicio de inventario.',
        mensaje: 'Error interno del servicio de inventario.'
    });
}

function idUsuarioDe(req) {
    return req.usuario ? req.usuario.id : null;
}

// POST /api/inventario/disponibilidad (público)
async function disponibilidad(req, res) {
    try {
        const datos = await inventario.consultarDisponibilidad(req.body?.articulos ?? req.body?.productos);
        return res.json({ success: true, exitoso: true, data: datos, datos });
    } catch (error) {
        return responderError(res, error, 'disponibilidad');
    }
}

// POST /api/inventario/ventas/salida (interno)
async function salidaVenta(req, res) {
    try {
        const resultado = await inventario.aplicarSalidaVenta({
            idPedido: req.body?.id_pedido,
            articulos: req.body?.articulos,
            origen: req.body?.origen,
            idUsuario: Number(req.body?.id_usuario) || null
        });

        return res.status(resultado.ya_aplicado ? 200 : 201).json({
            success: true,
            exitoso: true,
            mensaje: resultado.ya_aplicado
                ? 'El inventario de este pedido ya se había descontado.'
                : 'Inventario descontado correctamente.',
            data: resultado,
            datos: resultado
        });
    } catch (error) {
        return responderError(res, error, 'salida por venta');
    }
}

// POST /api/inventario/ventas/cancelacion (interno)
async function cancelacionVenta(req, res) {
    try {
        const resultado = await inventario.reintegrarCancelacion({
            idPedido: req.body?.id_pedido,
            origen: req.body?.origen,
            motivo: req.body?.motivo,
            idUsuario: Number(req.body?.id_usuario) || null
        });

        return res.json({ success: true, exitoso: true, data: resultado, datos: resultado });
    } catch (error) {
        return responderError(res, error, 'cancelación');
    }
}

// POST /api/inventario/devoluciones/reintegro (interno)
async function reintegroDevolucion(req, res) {
    try {
        const resultado = await inventario.reintegrarDevolucion({
            idDevolucion: req.body?.id_devolucion,
            idProducto: req.body?.id_producto,
            cantidad: req.body?.cantidad,
            idPedido: req.body?.id_pedido,
            idUsuario: Number(req.body?.id_usuario) || null,
            origen: req.body?.origen
        });

        return res.json({ success: true, exitoso: true, data: resultado, datos: resultado });
    } catch (error) {
        return responderError(res, error, 'reintegro por devolución');
    }
}

// POST /api/inventario/entradas (ADMIN, VENDEDOR)
async function entrada(req, res) {
    try {
        const movimiento = await inventario.registrarEntrada({
            idProducto: req.body?.id_producto,
            cantidad: req.body?.cantidad,
            motivo: req.body?.motivo ? String(req.body.motivo).trim() : null,
            clave: req.body?.clave_operacion || null,
            idUsuario: idUsuarioDe(req)
        });

        return res.status(201).json({
            success: true,
            exitoso: true,
            mensaje: 'Entrada de mercancía registrada.',
            data: movimiento,
            datos: movimiento
        });
    } catch (error) {
        return responderError(res, error, 'entrada');
    }
}

// POST /api/inventario/ajustes (ADMIN)
async function ajuste(req, res) {
    try {
        const resultado = await inventario.registrarAjuste({
            idProducto: req.body?.id_producto,
            stockNuevo: req.body?.stock_nuevo,
            motivo: req.body?.motivo,
            idUsuario: idUsuarioDe(req)
        });

        return res.json({
            success: true,
            exitoso: true,
            mensaje: resultado.sin_cambios ? 'El stock ya tenía ese valor.' : 'Ajuste registrado.',
            data: resultado,
            datos: resultado
        });
    } catch (error) {
        return responderError(res, error, 'ajuste');
    }
}

// GET /api/inventario/movimientos (ADMIN, VENDEDOR)
async function movimientos(req, res) {
    try {
        const filas = await inventario.listarMovimientos({
            idProducto: req.query.id_producto,
            tipo: req.query.tipo,
            idPedido: req.query.id_pedido,
            desde: req.query.desde,
            hasta: req.query.hasta,
            limite: req.query.limite
        });

        return res.json({ success: true, exitoso: true, total: filas.length, data: filas, datos: filas });
    } catch (error) {
        return responderError(res, error, 'movimientos');
    }
}

// GET /api/inventario/ventas-por-producto (ADMIN, VENDEDOR)
async function ventasPorProducto(req, res) {
    try {
        const filas = await inventario.resumenVentasPorProducto();
        return res.json({ success: true, exitoso: true, data: filas, datos: filas });
    } catch (error) {
        return responderError(res, error, 'ventas por producto');
    }
}

// GET /api/inventario/alertas (ADMIN, VENDEDOR)
async function alertas(req, res) {
    try {
        const datos = await inventario.listarAlertas({
            soloNoLeidas: req.query.no_leidas === '1',
            limite: req.query.limite
        });

        return res.json({ success: true, exitoso: true, data: datos, datos });
    } catch (error) {
        return responderError(res, error, 'alertas');
    }
}

// PATCH /api/inventario/alertas/leidas (ADMIN, VENDEDOR)
async function marcarLeidas(req, res) {
    try {
        const total = await inventario.marcarAlertasLeidas(req.body?.ids);
        return res.json({ success: true, exitoso: true, actualizadas: total });
    } catch (error) {
        return responderError(res, error, 'marcar alertas');
    }
}

module.exports = {
    disponibilidad,
    salidaVenta,
    cancelacionVenta,
    reintegroDevolucion,
    entrada,
    ajuste,
    movimientos,
    ventasPorProducto,
    alertas,
    marcarLeidas
};
