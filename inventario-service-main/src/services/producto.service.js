
const pool = require('../config/database');

// Columnas de precio con oferta (se reutilizan en varias consultas).
const COLUMNAS_PRECIO = `
            p.precio AS precio_original,
            CASE
                WHEN o.activa = TRUE THEN o.precio_oferta
                ELSE p.precio
            END AS precio_mostrar,
            CASE
                WHEN o.activa = TRUE THEN TRUE
                ELSE FALSE
            END AS oferta_activa,
            CASE
                WHEN o.activa = TRUE THEN o.porcentaje_descuento
                ELSE 0
            END AS porcentaje_descuento`;

// Listado completo para el personal (incluye agotados e inactivos).
const obtenerTodos = async () => {
    const [productos] = await pool.query(`
        SELECT
            p.*,
            ${COLUMNAS_PRECIO},
            COALESCE(s.stock_actual, 0) AS stock_actual,
            COALESCE(s.stock_minimo, 0) AS stock_minimo,
            COALESCE(s.stock_maximo, 0) AS stock_maximo,
            (p.activo = 1 AND COALESCE(s.stock_actual, 0) > 0) AS disponible
        FROM productos p
        LEFT JOIN ofertas o
            ON p.id = o.id_producto
        LEFT JOIN stock s
            ON s.id_producto = p.id
        ORDER BY p.id DESC
    `);
    return productos;
};

// Catálogo público: SOLO productos activos con existencias reales en MySQL.
// No incluye el costo del producto.
const obtenerCatalogo = async () => {
    const [productos] = await pool.query(`
        SELECT
            p.id,
            p.nombre,
            p.descripcion,
            p.precio,
            p.imagen,
            ${COLUMNAS_PRECIO},
            s.stock_actual AS stock_disponible,
            TRUE AS disponible
        FROM productos p
        INNER JOIN stock s
            ON s.id_producto = p.id
        LEFT JOIN ofertas o
            ON p.id = o.id_producto
        WHERE p.activo = 1
          AND s.stock_actual > 0
        ORDER BY p.id DESC
    `);
    return productos;
};

// Productos que coinciden con la búsqueda pero no están disponibles.
// Solo se devuelve información mínima para mostrar "no disponible".
const buscarNoDisponibles = async (texto) => {
    const patron = `%${String(texto).replace(/[\\%_]/g, caracter => `\\${caracter}`)}%`;

    const [productos] = await pool.query(`
        SELECT p.id, p.nombre
        FROM productos p
        LEFT JOIN stock s
            ON s.id_producto = p.id
        WHERE p.activo = 1
          AND COALESCE(s.stock_actual, 0) <= 0
          AND p.nombre LIKE ?
        ORDER BY p.nombre
        LIMIT 10
    `, [patron]);

    return productos;
};

const obtenerPorId = async (id) => {
    const [productos] = await pool.query(
        `SELECT
            p.*,
            ${COLUMNAS_PRECIO},
            COALESCE(s.stock_actual, 0) AS stock_actual,
            (p.activo = 1 AND COALESCE(s.stock_actual, 0) > 0) AS disponible
         FROM productos p
         LEFT JOIN ofertas o ON o.id_producto = p.id
         LEFT JOIN stock s ON s.id_producto = p.id
         WHERE p.id = ?`,
        [id]
    );
    return productos[0];
};

const crear = async (producto) => {
    const {
        nombre,
        descripcion,
        lote,
        serie,
        caducidad,
        id_proveedor,
        costo,
        precio,
        imagen
    } = producto;

    const [resultado] = await pool.query(
        `INSERT INTO productos
        (nombre, descripcion, lote, serie, caducidad,
         id_proveedor, costo, precio, imagen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            nombre,
            descripcion || null,
            lote || null,
            serie || null,
            caducidad || null,
            id_proveedor || null,
            costo,
            precio,
            imagen || null
        ]
    );

    // Todo producto nuevo inicia con 0 existencias reales.
    await pool.query(
        `INSERT INTO stock (id_producto, stock_actual, stock_minimo, stock_maximo)
         VALUES (?, 0, 0, 0)
         ON DUPLICATE KEY UPDATE id_producto = id_producto`,
        [resultado.insertId]
    );

    return obtenerPorId(resultado.insertId);
};

const actualizar = async (id, producto) => {
    const {
        nombre,
        descripcion,
        lote,
        serie,
        caducidad,
        id_proveedor,
        costo,
        precio,
        imagen
    } = producto;

    await pool.query(
        `UPDATE productos
         SET nombre = ?,
             descripcion = ?,
             lote = ?,
             serie = ?,
             caducidad = ?,
             id_proveedor = ?,
             costo = ?,
             precio = ?,
             imagen = COALESCE(?, imagen)
         WHERE id = ?`,
        [
            nombre,
            descripcion || null,
            lote || null,
            serie || null,
            caducidad || null,
            id_proveedor || null,
            costo,
            precio,
            imagen || null,
            id
        ]
    );

    return obtenerPorId(id);
};

// Eliminación LÓGICA: el producto deja de mostrarse y venderse, pero se
// conservan sus ventas, movimientos y reseñas (evita registros huérfanos).
const eliminar = async (id) => {
    const [resultado] = await pool.query(
        'UPDATE productos SET activo = 0 WHERE id = ?',
        [id]
    );
    return resultado.affectedRows;
};

const reactivar = async (id) => {
    const [resultado] = await pool.query(
        'UPDATE productos SET activo = 1 WHERE id = ?',
        [id]
    );
    return resultado.affectedRows;
};

const proveedorExiste = async (idProveedor) => {
    const [proveedores] = await pool.query(
        'SELECT id FROM proveedores WHERE id = ?',
        [idProveedor]
    );

    return proveedores.length > 0;
};

module.exports = {
    obtenerTodos,
    obtenerCatalogo,
    buscarNoDisponibles,
    obtenerPorId,
    reactivar,
    crear,
    actualizar,
    eliminar,
    proveedorExiste
};
