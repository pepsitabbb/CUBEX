
const productoService = require('../services/producto.service');
const { esPersonal } = require('../config/seguridad');

// Quita la información interna (costo, lote, serie) para los clientes.
function versionPublica(producto) {
    return {
        id: producto.id,
        nombre: producto.nombre,
        descripcion: producto.descripcion,
        precio: producto.precio,
        imagen: producto.imagen,
        precio_original: producto.precio_original,
        precio_mostrar: producto.precio_mostrar,
        oferta_activa: producto.oferta_activa,
        porcentaje_descuento: producto.porcentaje_descuento,
        stock_disponible: Number(producto.stock_actual ?? producto.stock_disponible ?? 0),
        disponible: Boolean(Number(producto.disponible))
    };
}

// Catálogo público: solo productos activos con stock > 0 (calculado en MySQL).
const obtenerCatalogo = async (req, res) => {
    try {
        const productos = await productoService.obtenerCatalogo();
        return res.status(200).json({
            success: true,
            message: 'Catálogo de productos disponibles',
            total: productos.length,
            data: productos.map(p => ({ ...p, disponible: true, stock_disponible: Number(p.stock_disponible) }))
        });
    } catch (error) {
        console.error('Error al consultar catálogo:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Búsqueda pública: disponibles + coincidencias agotadas (solo nombre).
const buscarCatalogo = async (req, res) => {
    try {
        const texto = String(req.query.q || '').trim().slice(0, 80);

        const disponibles = await productoService.obtenerCatalogo();
        const normalizar = valor => String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        const coincidencias = texto
            ? disponibles.filter(p => normalizar(p.nombre).includes(normalizar(texto)))
            : disponibles;

        const noDisponibles = texto
            ? await productoService.buscarNoDisponibles(texto)
            : [];

        return res.status(200).json({
            success: true,
            data: coincidencias,
            no_disponibles: noDisponibles
        });
    } catch (error) {
        console.error('Error al buscar productos:', error);
        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Obtener todos los productos con sus precios y ofertas
const obtenerProductos = async (req, res) => {
    try {
        // El personal ve todo el catálogo (incluye agotados e inactivos).
        // Cualquier otra consulta recibe solo los productos disponibles.
        if (!esPersonal(req.usuario)) {
            return obtenerCatalogo(req, res);
        }

        const productos = await productoService.obtenerTodos();

        return res.status(200).json({
            success: true,
            message: 'Lista de productos',
            data: productos
        });

    } catch (error) {
        console.error('Error al consultar productos:', error);

        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Obtener un producto por su ID con información de oferta
const obtenerProductoPorId = async (req, res) => {
    try {
        const { id } = req.params;

        const producto = await productoService.obtenerPorId(id);

        // Los clientes no ven productos dados de baja.
        if (!producto || (!esPersonal(req.usuario) && Number(producto.activo) !== 1)) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        // Versión pública: sin costo, lote ni serie, con disponibilidad real.
        if (!esPersonal(req.usuario)) {
            const publico = versionPublica(producto);

            return res.status(200).json({
                success: true,
                message: publico.disponible
                    ? 'Producto encontrado'
                    : 'Este producto no está disponible por el momento',
                data: publico
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Producto encontrado',
            data: producto
        });

    } catch (error) {
        console.error('Error al consultar producto:', error);

        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Crear un producto
const crearProducto = async (req, res) => {
    try {
        const {
            nombre,
            descripcion,
            id_proveedor,
            costo,
            precio
        } = req.body;

        if (!nombre || costo === undefined || precio === undefined) {
            return res.status(400).json({
                success: false,
                message: 'nombre, costo y precio son obligatorios'
            });
        }

        if (
            Number(costo) < 0 ||
            Number(precio) < 0 ||
            !Number.isFinite(Number(costo)) ||
            !Number.isFinite(Number(precio))
        ) {
            return res.status(400).json({
                success: false,
                message: 'costo y precio deben ser números válidos y no negativos'
            });
        }

        if (id_proveedor !== null && id_proveedor !== undefined) {
            const existe = await productoService.proveedorExiste(id_proveedor);

            if (!existe) {
                return res.status(400).json({
                    success: false,
                    message: 'El proveedor especificado no existe'
                });
            }
        }

        const productoCreado = await productoService.crear({
            ...req.body,
            descripcion: descripcion || null
        });

        return res.status(201).json({
            success: true,
            message: 'Producto registrado correctamente',
            data: productoCreado
        });

    } catch (error) {
        console.error('Error al registrar producto:', error);

        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Actualizar un producto
const actualizarProducto = async (req, res) => {
    try {
        const { id } = req.params;

        const {
            nombre,
            descripcion,
            id_proveedor,
            costo,
            precio
        } = req.body;

        const productoExistente = await productoService.obtenerPorId(id);

        if (!productoExistente) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        if (!nombre || costo === undefined || precio === undefined) {
            return res.status(400).json({
                success: false,
                message: 'nombre, costo y precio son obligatorios'
            });
        }

        if (
            Number(costo) < 0 ||
            Number(precio) < 0 ||
            !Number.isFinite(Number(costo)) ||
            !Number.isFinite(Number(precio))
        ) {
            return res.status(400).json({
                success: false,
                message: 'costo y precio deben ser números válidos y no negativos'
            });
        }

        if (id_proveedor !== null && id_proveedor !== undefined) {
            const existe = await productoService.proveedorExiste(id_proveedor);

            if (!existe) {
                return res.status(400).json({
                    success: false,
                    message: 'El proveedor especificado no existe'
                });
            }
        }

        const productoActualizado = await productoService.actualizar(id, {
            ...req.body,
            descripcion: descripcion || null
        });

        return res.status(200).json({
            success: true,
            message: 'Producto actualizado correctamente',
            data: productoActualizado
        });

    } catch (error) {
        console.error('Error al actualizar producto:', error);

        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Eliminar un producto
const eliminarProducto = async (req, res) => {
    try {
        const { id } = req.params;

        const filasEliminadas = await productoService.eliminar(id);

        if (filasEliminadas === 0) {
            return res.status(404).json({
                success: false,
                message: 'Producto no encontrado'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Producto dado de baja. Ya no se mostrará en la tienda; su historial se conserva.'
        });

    } catch (error) {
        console.error('Error al eliminar producto:', error);

        return res.status(500).json({
            success: false,
            message: 'Error interno del servidor'
        });
    }
};

// Volver a mostrar un producto dado de baja
const reactivarProducto = async (req, res) => {
    try {
        const filas = await productoService.reactivar(req.params.id);
        if (filas === 0) {
            return res.status(404).json({ success: false, message: 'Producto no encontrado' });
        }
        return res.status(200).json({
            success: true,
            message: 'Producto reactivado. Se mostrará en la tienda cuando tenga existencias.'
        });
    } catch (error) {
        console.error('Error al reactivar producto:', error);
        return res.status(500).json({ success: false, message: 'Error interno del servidor' });
    }
};

module.exports = {
    obtenerCatalogo,
    buscarCatalogo,
    reactivarProducto,
    obtenerProductos,
    obtenerProductoPorId,
    crearProducto,
    actualizarProducto,
    eliminarProducto
};
