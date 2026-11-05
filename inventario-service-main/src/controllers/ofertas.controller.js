
const pool = require('../config/database');
const stockService = require('../services/stock.service');

// Calcular la oferta sugerida con datos reales de MySQL
async function evaluarDescuento(req, res) {
    try {
        const idProducto = Number(req.body.IdProducto);

        if (!Number.isInteger(idProducto) || idProducto <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El ID del producto no es válido.'
            });
        }

        const producto = await stockService.obtenerPorId(idProducto);

        if (!producto) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró el producto.'
            });
        }

        const stockActual = Number(producto.stock_actual ?? 0);
        const stockMaximo = Number(producto.stock_maximo ?? 0);
        const precioOriginal = Number(producto.precio);

        let porcentaje = 0;
        let mensaje = 'Sin descuento disponible';

        if (stockMaximo > 0 && stockActual >= stockMaximo) {
            porcentaje = 20;
            mensaje = 'Descuento del 20% por alcanzar o superar el stock máximo';
        } else if (stockMaximo > 0 && stockActual >= stockMaximo * 0.8) {
            porcentaje = 10;
            mensaje = 'Descuento del 10% por alto nivel de inventario';
        }

        // Si el stock vuelve a la normalidad, desactivar la oferta anterior
        if (porcentaje === 0) {
            await pool.query(`
                UPDATE ofertas
                SET activa = FALSE
                WHERE id_producto = ?
            `, [idProducto]);
        }

        const descuento = Number(
            (precioOriginal * porcentaje / 100).toFixed(2)
        );

        const precioFinal = Number(
            (precioOriginal - descuento).toFixed(2)
        );

        // Consultar si existe una oferta activa
        const [ofertas] = await pool.query(`
            SELECT porcentaje_descuento, precio_oferta, activa
            FROM ofertas
            WHERE id_producto = ?
            LIMIT 1
        `, [idProducto]);

        const ofertaActiva =
            ofertas.length > 0 && Boolean(ofertas[0].activa);

        return res.json({
            success: true,
            data: {
                IdProducto: producto.id_producto,
                Nombre: producto.nombre,
                StockActual: stockActual,
                StockMaximo: stockMaximo,
                PrecioOriginal: precioOriginal,
                PorcentajeDescuento: porcentaje,
                DescuentoAplicado: descuento,
                PrecioFinal: precioFinal,
                Mensaje: mensaje,
                OfertaActiva: ofertaActiva
            }
        });

    } catch (error) {
        console.error('Error al evaluar descuento:', error);

        return res.status(500).json({
            success: false,
            message: 'No se pudo calcular el descuento.'
        });
    }
}

// Aplicar la oferta aceptada por el administrador
async function aplicarOferta(req, res) {
    try {
        const idProducto = Number(req.params.id);

        if (!Number.isInteger(idProducto) || idProducto <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El ID del producto no es válido.'
            });
        }

        const producto = await stockService.obtenerPorId(idProducto);

        if (!producto) {
            return res.status(404).json({
                success: false,
                message: 'No se encontró el producto.'
            });
        }

        const stockActual = Number(producto.stock_actual ?? 0);
        const stockMaximo = Number(producto.stock_maximo ?? 0);
        const precioOriginal = Number(producto.precio);

        let porcentaje = 0;

        if (stockMaximo > 0 && stockActual >= stockMaximo) {
            porcentaje = 20;
        } else if (stockMaximo > 0 && stockActual >= stockMaximo * 0.8) {
            porcentaje = 10;
        }

        if (porcentaje === 0) {
            return res.status(400).json({
                success: false,
                message: 'El producto no tiene una oferta disponible.'
            });
        }

        const precioOferta = Number(
            (precioOriginal * (1 - porcentaje / 100)).toFixed(2)
        );

        await pool.query(`
            INSERT INTO ofertas (
                id_producto,
                porcentaje_descuento,
                precio_oferta,
                activa
            )
            VALUES (?, ?, ?, TRUE)
            ON DUPLICATE KEY UPDATE
                porcentaje_descuento = VALUES(porcentaje_descuento),
                precio_oferta = VALUES(precio_oferta),
                activa = TRUE
        `, [idProducto, porcentaje, precioOferta]);

        return res.json({
            success: true,
            message: 'Oferta aplicada correctamente.',
            data: {
                IdProducto: idProducto,
                Nombre: producto.nombre,
                PrecioOriginal: precioOriginal,
                PorcentajeDescuento: porcentaje,
                PrecioOferta: precioOferta
            }
        });

    } catch (error) {
        console.error('Error al aplicar oferta:', error);

        return res.status(500).json({
            success: false,
            message: 'No se pudo aplicar la oferta.'
        });
    }
}

// Desactivar la oferta y recuperar el precio normal
async function desactivarOferta(req, res) {
    try {
        const idProducto = Number(req.params.id);

        if (!Number.isInteger(idProducto) || idProducto <= 0) {
            return res.status(400).json({
                success: false,
                message: 'El ID del producto no es válido.'
            });
        }

        await pool.query(`
            UPDATE ofertas
            SET activa = FALSE
            WHERE id_producto = ?
        `, [idProducto]);

        return res.json({
            success: true,
            message: 'Oferta desactivada. Se mostrará el precio original.'
        });

    } catch (error) {
        console.error('Error al desactivar oferta:', error);

        return res.status(500).json({
            success: false,
            message: 'No se pudo desactivar la oferta.'
        });
    }
}

// NUEVO: Consultar todas las ofertas activas para la tienda principal
async function obtenerOfertasActivas(req, res) {
    try {
        const [ofertas] = await pool.query(`
            SELECT
                o.id_producto,
                o.porcentaje_descuento,
                o.precio_oferta,
                o.activa,
                p.precio AS precio_original
            FROM ofertas o
            INNER JOIN productos p
                ON p.id = o.id_producto
            WHERE o.activa = TRUE
        `);

        return res.json({
            success: true,
            data: ofertas
        });

    } catch (error) {
        console.error('Error al consultar ofertas activas:', error);

        return res.status(500).json({
            success: false,
            message: 'No se pudieron consultar las ofertas activas.'
        });
    }
}

module.exports = {
    evaluarDescuento,
    aplicarOferta,
    desactivarOferta,
    obtenerOfertasActivas
};
