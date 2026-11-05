const pedidosService = require('../services/pedidos.service');
const { esPersonal } = require('../config/seguridad');

// ========================================
// UTILIDADES
// ========================================

function idValido(valor) {
    const numero = Number(valor);
    return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function responderError(res, error, contexto) {
    const status = error.status || 500;

    if (status >= 500 && !error.codigo) {
        console.error(`Error en pedidos (${contexto}):`, error);
    }

    return res.status(status).json({
        exitoso: false,
        codigo: error.codigo || 'ERROR_INTERNO',
        mensaje: status >= 500 && !error.codigo
            ? 'Error interno del servicio de pedidos.'
            : error.message,
        detalle: error.detalle || null
    });
}

// El cliente solo puede ver sus propios pedidos; el personal ve todos.
function puedeVerPedido(req, pedido) {
    if (req.servicioInterno || esPersonal(req.usuario)) {
        return true;
    }

    return Boolean(
        req.usuario &&
        Number(pedido.id_usuario) === Number(req.usuario.id)
    );
}

// ========================================
// CONSULTAS
// ========================================

// GET /api/Pedidos (ADMIN, VENDEDOR)
const obtenerPedidos = async (req, res) => {
    try {
        const pedidos = await pedidosService.obtenerPedidos({
            estado: String(req.query.estado || '').trim().slice(0, 30),
            busqueda: String(req.query.q || '').trim().slice(0, 80)
        });

        return res.status(200).json({ exitoso: true, total: pedidos.length, datos: pedidos });
    } catch (error) {
        return responderError(res, error, 'listar');
    }
};

// GET /api/Pedidos/mis-pedidos (CLIENTE autenticado)
const obtenerMisPedidos = async (req, res) => {
    try {
        const pedidos = await pedidosService.obtenerPedidosPorUsuario(req.usuario.id);
        return res.status(200).json({ exitoso: true, total: pedidos.length, datos: pedidos });
    } catch (error) {
        return responderError(res, error, 'mis pedidos');
    }
};

// GET /api/Pedidos/usuario/:id_usuario (compatibilidad con perfil.js)
const obtenerPedidosPorUsuario = async (req, res) => {
    try {
        const idUsuario = idValido(req.params.id_usuario);

        if (!idUsuario) {
            return res.status(400).json({ exitoso: false, mensaje: 'ID de usuario no válido' });
        }

        if (!esPersonal(req.usuario) && Number(req.usuario.id) !== idUsuario) {
            return res.status(403).json({
                exitoso: false,
                codigo: 'ACCESO_DENEGADO',
                mensaje: 'Solo puedes consultar tus propios pedidos.'
            });
        }

        const pedidos = await pedidosService.obtenerPedidosPorUsuario(idUsuario);
        return res.status(200).json({ exitoso: true, total: pedidos.length, datos: pedidos });
    } catch (error) {
        return responderError(res, error, 'pedidos por usuario');
    }
};

// GET /api/Pedidos/:id (dueño, personal o servicio interno)
const obtenerPedido = async (req, res) => {
    try {
        const id = idValido(req.params.id);

        if (!id) {
            return res.status(400).json({ exitoso: false, mensaje: 'ID de pedido no válido' });
        }

        const pedido = await pedidosService.obtenerPedidoCompleto(id);

        // Se responde 404 también cuando no es suyo, para no revelar pedidos ajenos.
        if (!pedido || !puedeVerPedido(req, pedido)) {
            return res.status(404).json({ exitoso: false, mensaje: 'Pedido no encontrado' });
        }

        return res.status(200).json({ exitoso: true, datos: pedido });
    } catch (error) {
        return responderError(res, error, 'consultar');
    }
};

// GET /api/Pedidos/:id/validar-stock (dueño, personal o servicio interno)
const validarStock = async (req, res) => {
    try {
        const id = idValido(req.params.id);

        if (!id) {
            return res.status(400).json({ exitoso: false, mensaje: 'ID de pedido no válido' });
        }

        const pedido = await pedidosService.obtenerPedidoCompleto(id);

        if (!pedido || !puedeVerPedido(req, pedido)) {
            return res.status(404).json({ exitoso: false, mensaje: 'Pedido no encontrado' });
        }

        const resultado = await pedidosService.validarStockPedido(id);
        return res.status(200).json({ exitoso: true, datos: resultado });
    } catch (error) {
        return responderError(res, error, 'validar stock');
    }
};

// ========================================
// REGISTRAR PEDIDO (CLIENTE)
// ========================================

const registrarPedido = async (req, res) => {
    try {
        const { id_usuario, id_direccion, productos, clave_idempotencia } = req.body || {};

        // El usuario se toma del token; no se acepta otro distinto.
        if (id_usuario !== undefined && Number(id_usuario) !== Number(req.usuario.id)) {
            return res.status(403).json({
                exitoso: false,
                codigo: 'ACCESO_DENEGADO',
                mensaje: 'No puedes registrar pedidos a nombre de otro usuario.'
            });
        }

        const direccionId = idValido(id_direccion);

        if (!direccionId) {
            return res.status(400).json({ exitoso: false, mensaje: 'Selecciona un domicilio válido' });
        }

        if (!Array.isArray(productos) || productos.length === 0) {
            return res.status(400).json({ exitoso: false, mensaje: 'El carrito está vacío' });
        }

        if (productos.length > 100) {
            return res.status(400).json({ exitoso: false, mensaje: 'El pedido tiene demasiados productos.' });
        }

        let clave = null;

        if (clave_idempotencia !== undefined && clave_idempotencia !== null && clave_idempotencia !== '') {
            clave = String(clave_idempotencia);

            if (!/^[A-Za-z0-9_-]{8,64}$/.test(clave)) {
                return res.status(400).json({ exitoso: false, mensaje: 'La clave de la solicitud no es válida.' });
            }
        }

        const { pedido, repetido } = await pedidosService.registrarPedido({
            idUsuario: req.usuario.id,
            idDireccion: direccionId,
            productos,
            claveIdempotencia: clave
        });

        return res.status(repetido ? 200 : 201).json({
            exitoso: true,
            repetido,
            mensaje: repetido
                ? 'Este pedido ya se había registrado.'
                : 'Pedido pendiente registrado correctamente',
            datos: pedido
        });
    } catch (error) {
        return responderError(res, error, 'registrar');
    }
};

// ========================================
// CONFIRMAR PAGO (servicio de pagos o ADMIN)
// ========================================

const confirmarPago = async (req, res) => {
    try {
        const id = idValido(req.params.id);

        if (!id) {
            return res.status(400).json({ exitoso: false, mensaje: 'ID de pedido no válido' });
        }

        const referencia = req.body && req.body.referencia_pago
            ? String(req.body.referencia_pago).trim().slice(0, 100)
            : null;

        const { pedido, ya_confirmado } = await pedidosService.confirmarPago(id, {
            referenciaPago: referencia,
            idUsuario: req.usuario ? req.usuario.id : null
        });

        return res.status(200).json({
            exitoso: true,
            ya_confirmado,
            mensaje: ya_confirmado
                ? 'El pedido ya estaba confirmado.'
                : 'Pago autorizado y pedido confirmado correctamente',
            datos: pedido
        });
    } catch (error) {
        return responderError(res, error, 'confirmar pago');
    }
};

// ========================================
// CANCELAR
// ========================================

// PATCH /api/Pedidos/:id/cancelar (el cliente cancela su pedido pendiente)
const cancelarPropio = async (req, res) => {
    try {
        const id = idValido(req.params.id);

        if (!id) {
            return res.status(400).json({ exitoso: false, mensaje: 'ID de pedido no válido' });
        }

        const pedido = await pedidosService.obtenerPedidoCompleto(id);

        if (!pedido || Number(pedido.id_usuario) !== Number(req.usuario.id)) {
            return res.status(404).json({ exitoso: false, mensaje: 'Pedido no encontrado' });
        }

        const resultado = await pedidosService.cancelarPedido(id, {
            motivo: 'Cancelado por el cliente',
            idUsuario: req.usuario.id,
            soloPendiente: true
        });

        return res.status(200).json({
            exitoso: true,
            mensaje: 'Pedido cancelado correctamente.',
            datos: resultado.pedido
        });
    } catch (error) {
        return responderError(res, error, 'cancelar propio');
    }
};

// PATCH /api/Pedidos/:id/estado (ADMIN)
const actualizarEstado = async (req, res) => {
    try {
        const id = idValido(req.params.id);
        const estado = String(req.body?.estado || '').trim().toLowerCase();
        const motivo = req.body?.motivo ? String(req.body.motivo).trim().slice(0, 255) : null;

        if (!id) {
            return res.status(400).json({ exitoso: false, mensaje: 'ID de pedido no válido' });
        }

        if (!['pendiente', 'confirmado', 'cancelado'].includes(estado)) {
            return res.status(400).json({ exitoso: false, mensaje: 'Estado no válido' });
        }

        const actual = await pedidosService.obtenerPedido(id);

        if (!actual) {
            return res.status(404).json({ exitoso: false, mensaje: 'Pedido no encontrado' });
        }

        const estadoActual = String(actual.estado || '').toLowerCase();

        if (estado === 'pendiente') {
            if (estadoActual !== 'pendiente') {
                return res.status(409).json({
                    exitoso: false,
                    codigo: 'TRANSICION_NO_PERMITIDA',
                    mensaje: 'Un pedido confirmado o cancelado no puede regresar a pendiente.'
                });
            }

            return res.status(200).json({
                exitoso: true,
                mensaje: 'El pedido ya estaba pendiente.',
                datos: await pedidosService.obtenerPedidoCompleto(id)
            });
        }

        if (estado === 'confirmado') {
            // Confirmación manual (por ejemplo, pago fuera de línea):
            // usa exactamente el mismo proceso que un pago aprobado.
            const { pedido, ya_confirmado } = await pedidosService.confirmarPago(id, {
                idUsuario: req.usuario.id
            });

            return res.status(200).json({
                exitoso: true,
                mensaje: ya_confirmado
                    ? 'El pedido ya estaba confirmado.'
                    : 'Pedido confirmado e inventario descontado.',
                datos: pedido
            });
        }

        const resultado = await pedidosService.cancelarPedido(id, {
            motivo: motivo || 'Cancelado por administración',
            idUsuario: req.usuario.id
        });

        let mensaje = 'Pedido cancelado correctamente.';

        if (resultado.reintegro?.reintegrado) {
            mensaje += ' Las existencias vendidas se reintegraron al inventario.';
        } else if (resultado.reintegro?.pendiente) {
            mensaje += ` ATENCIÓN: ${resultado.reintegro.mensaje}`;
        }

        return res.status(200).json({
            exitoso: true,
            mensaje,
            reintegro: resultado.reintegro,
            datos: resultado.pedido
        });
    } catch (error) {
        return responderError(res, error, 'actualizar estado');
    }
};

module.exports = {
    obtenerPedidos,
    obtenerMisPedidos,
    obtenerPedidosPorUsuario,
    obtenerPedido,
    validarStock,
    registrarPedido,
    confirmarPago,
    cancelarPropio,
    actualizarEstado
};
