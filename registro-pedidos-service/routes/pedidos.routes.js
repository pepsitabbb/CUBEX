const express = require('express');
const router = express.Router();

const pedidosController = require('../controllers/pedidos.controller');
const { requiereUsuario, requiereServicioOUsuario } = require('../config/seguridad');

// Consultar todos los pedidos (personal autorizado)
router.get('/', requiereUsuario('ADMIN', 'VENDEDOR'), pedidosController.obtenerPedidos);

// Pedidos del cliente autenticado (antes de /:id)
router.get('/mis-pedidos', requiereUsuario('CLIENTE'), pedidosController.obtenerMisPedidos);

// Compatibilidad: pedidos de un usuario (solo el propio, salvo personal)
router.get('/usuario/:id_usuario', requiereUsuario(), pedidosController.obtenerPedidosPorUsuario);

// Consultar un pedido (dueño, personal o microservicio interno)
router.get('/:id', requiereServicioOUsuario(), pedidosController.obtenerPedido);

// Verificar existencias de un pedido antes de cobrar
router.get('/:id/validar-stock', requiereServicioOUsuario(), pedidosController.validarStock);

// Registrar un pedido pendiente (cliente autenticado)
router.post('/', requiereUsuario('CLIENTE'), pedidosController.registrarPedido);

// Confirmar pedido después de autorizar el pago.
// SOLO microservicios de pago (X-Servicio-Clave) o ADMIN; nunca el navegador del cliente.
router.patch('/:id/confirmar-pago', requiereServicioOUsuario('ADMIN'), pedidosController.confirmarPago);

// El cliente cancela su pedido pendiente de pago
router.patch('/:id/cancelar', requiereUsuario('CLIENTE'), pedidosController.cancelarPropio);

// Cambiar estado administrativo (confirmar manualmente o cancelar)
router.patch('/:id/estado', requiereUsuario('ADMIN'), pedidosController.actualizarEstado);

module.exports = router;
