const express = require('express');
const router = express.Router();

const stockController = require('../controllers/stock.controller');
const { requiereUsuario } = require('../config/seguridad');

// Consultar inventario (personal autorizado)
router.get('/', requiereUsuario('ADMIN', 'VENDEDOR'), stockController.obtenerInventario);

// Configurar stock mínimo/máximo y, si cambia, el stock actual
// (el cambio de existencias queda registrado como movimiento de ajuste).
router.put('/:id_producto', requiereUsuario('ADMIN'), stockController.guardarStock);

module.exports = router;
