const stockService = require('../services/stock.service');

// Consultar inventario completo
const obtenerInventario = async (req, res) => {
    try {
        const inventario = await stockService.obtenerInventario();

        return res.status(200).json({
            success: true,
            message: 'Inventario consultado correctamente',
            data: inventario
        });

    } catch (error) {
        console.error('Error al consultar inventario:', error);

        return res.status(500).json({
            success: false,
            message: 'Error al consultar el inventario'
        });
    }
};

// Registrar o actualizar existencias
const guardarStock = async (req, res) => {
    try {
        const { id_producto } = req.params;

        const {
            stock_actual,
            stock_minimo,
            stock_maximo
        } = req.body;

        const id = Number(id_producto);

        if (!Number.isInteger(id) || id <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El ID del producto no es válido'
            });
        }

        const cantidades = [
            stock_actual ?? 0,
            stock_minimo,
            stock_maximo
        ];

        if (!cantidades.every(
            valor => Number.isInteger(valor) && valor >= 0
        )) {
            return res.status(400).json({
                success: false,
                message: 'Las cantidades deben ser números enteros no negativos'
            });
        }

        if (stock_maximo < stock_minimo) {
            return res.status(400).json({
                success: false,
                message: 'El stock máximo no puede ser menor que el mínimo'
            });
        }

        const existe = await stockService.productoExiste(id);

        if (!existe) {
            return res.status(404).json({
                success: false,
                message: 'El producto no existe'
            });
        }

        const inventario = await stockService.guardarStock(
            id,
            stock_actual,
            stock_minimo,
            stock_maximo,
            {
                motivo: req.body.motivo ? String(req.body.motivo).trim() : null,
                idUsuario: req.usuario ? req.usuario.id : null
            }
        );

        return res.status(200).json({
            success: true,
            message: 'Existencias guardadas correctamente',
            data: inventario
        });

    } catch (error) {
        console.error('Error al guardar existencias:', error);

        return res.status(500).json({
            success: false,
            message: 'Error al guardar las existencias'
        });
    }
};

module.exports = {
    obtenerInventario,
    guardarStock
};
