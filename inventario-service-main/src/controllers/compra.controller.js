const compraService = require('../services/compra.service');

// Registrar compra
const crearCompra = async (req, res) => {
    try {
        const {
            id_proveedor,
            id_producto,
            cantidad,
            costo_unitario,
            fecha
        } = req.body;

        // El usuario responsable se toma del token, no del formulario.
        const id_usuario = req.usuario ? req.usuario.id : null;

        if (
            !id_proveedor ||
            !id_usuario ||
            !id_producto ||
            !cantidad ||
            costo_unitario === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: 'Todos los campos obligatorios deben estar completos'
            });
        }

        const cantidadNumero = Number(cantidad);
        const costoNumero = Number(costo_unitario);

        if (
            !Number.isInteger(cantidadNumero) ||
            cantidadNumero <= 0 ||
            !Number.isFinite(costoNumero) ||
            costoNumero < 0
        ) {
            return res.status(400).json({
                success: false,
                message: 'La cantidad y el costo unitario no son válidos'
            });
        }

        const compra = await compraService.registrarCompra({
            id_proveedor: Number(id_proveedor),
            id_usuario: Number(id_usuario),
            id_producto: Number(id_producto),
            cantidad: cantidadNumero,
            costo_unitario: costoNumero,
            fecha: fecha || null
        });

        return res.status(201).json({
            success: true,
            message: 'Compra registrada y stock actualizado correctamente',
            data: compra
        });

    } catch (error) {
        console.error('Error al registrar compra:', error);

        const esValidacion = /no existe/i.test(error.message || '');
        return res.status(esValidacion ? 400 : 500).json({
            success: false,
            message: esValidacion
                ? error.message
                : 'Error interno al registrar la compra'
        });
    }
};


// Consultar compras
const listarCompras = async (req, res) => {
    try {
        const compras = await compraService.obtenerCompras();

        return res.status(200).json({
            success: true,
            data: compras
        });

    } catch (error) {
        console.error('Error al consultar compras:', error);

        return res.status(500).json({
            success: false,
            message: 'Error al consultar las compras'
        });
    }
};


module.exports = {
    crearCompra,
    listarCompras
};