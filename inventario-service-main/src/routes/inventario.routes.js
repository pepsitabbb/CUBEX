const express = require('express');
const router = express.Router();

const controlador = require('../controllers/inventario.controller');
const { requiereUsuario, requiereServicioOUsuario } = require('../config/seguridad');

// Público: el carrito consulta si hay existencias suficientes.
router.post('/disponibilidad', controlador.disponibilidad);

// Internos (otros microservicios con X-Servicio-Clave) o el administrador.
router.post('/ventas/salida', requiereServicioOUsuario('ADMIN'), controlador.salidaVenta);
router.post('/ventas/cancelacion', requiereServicioOUsuario('ADMIN'), controlador.cancelacionVenta);
router.post('/devoluciones/reintegro', requiereServicioOUsuario('ADMIN'), controlador.reintegroDevolucion);

// Personal autorizado.
router.post('/entradas', requiereUsuario('ADMIN', 'VENDEDOR'), controlador.entrada);
router.post('/ajustes', requiereUsuario('ADMIN'), controlador.ajuste);
router.get('/movimientos', requiereUsuario('ADMIN', 'VENDEDOR'), controlador.movimientos);
router.get('/ventas-por-producto', requiereUsuario('ADMIN', 'VENDEDOR'), controlador.ventasPorProducto);
router.get('/alertas', requiereUsuario('ADMIN', 'VENDEDOR'), controlador.alertas);
router.patch('/alertas/leidas', requiereUsuario('ADMIN', 'VENDEDOR'), controlador.marcarLeidas);

module.exports = router;
