const express = require('express');
const router = express.Router();

const ofertasController = require('../controllers/ofertas.controller');
const { requiereUsuario } = require('../config/seguridad');

// Público: la tienda muestra las ofertas activas.
router.get('/activas', ofertasController.obtenerOfertasActivas);

// Gestión de ofertas (personal autorizado)
router.post('/evaluar-descuento', requiereUsuario('ADMIN', 'VENDEDOR'), ofertasController.evaluarDescuento);
router.post('/:id/aplicar', requiereUsuario('ADMIN'), ofertasController.aplicarOferta);
router.put('/:id/desactivar', requiereUsuario('ADMIN'), ofertasController.desactivarOferta);

module.exports = router;
