const express = require('express');
const router = express.Router();

const productoController = require('../controllers/producto.controller');
const { validarId, validarProducto } = require('../middlewares/validarProducto');
const uploadImagen = require('../middlewares/uploadImagen');
const { requiereUsuario, usuarioOpcional } = require('../config/seguridad');

// Catálogo público: solo productos activos con existencias (> 0).
router.get('/catalogo', productoController.obtenerCatalogo);

// Búsqueda pública (incluye aviso de productos no disponibles).
router.get('/catalogo/buscar', productoController.buscarCatalogo);

// Consultar productos: el personal ve todos; el público, solo disponibles.
router.get('/', usuarioOpcional, productoController.obtenerProductos);

// Consultar producto por ID
router.get('/:id', validarId, usuarioOpcional, productoController.obtenerProductoPorId);

// Registrar producto con fotografía (ADMIN y VENDEDOR)
router.post(
    '/',
    requiereUsuario('ADMIN', 'VENDEDOR'),
    uploadImagen.single('imagen'),
    (req, res, next) => {
        if (req.file) {
            req.body.imagen = `/uploads/${req.file.filename}`;
        }
        next();
    },
    validarProducto,
    productoController.crearProducto
);

// Actualizar producto y, opcionalmente, su fotografía (ADMIN y VENDEDOR)
router.put(
    '/:id',
    validarId,
    requiereUsuario('ADMIN', 'VENDEDOR'),
    uploadImagen.single('imagen'),
    (req, res, next) => {
        if (req.file) {
            req.body.imagen = `/uploads/${req.file.filename}`;
        }
        next();
    },
    validarProducto,
    productoController.actualizarProducto
);

// Dar de baja (eliminación lógica) - solo ADMIN
router.delete('/:id', validarId, requiereUsuario('ADMIN'), productoController.eliminarProducto);

// Reactivar producto dado de baja - solo ADMIN
router.patch('/:id/reactivar', validarId, requiereUsuario('ADMIN'), productoController.reactivarProducto);

module.exports = router;
