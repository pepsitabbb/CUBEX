const express = require('express');
const router = express.Router();

const compraController = require('../controllers/compra.controller');
const { requiereUsuario } = require('../config/seguridad');

// Consultar compras a proveedores
router.get('/', requiereUsuario('ADMIN', 'VENDEDOR'), compraController.listarCompras);

// Registrar compra (aumenta el stock y registra el movimiento de entrada)
router.post('/', requiereUsuario('ADMIN'), compraController.crearCompra);

module.exports = router;
