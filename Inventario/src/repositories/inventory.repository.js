
export function createInventoryRepository(pool) {
    return {
        async ping() {
            await pool.query('SELECT 1');
        },

        async findProducts({ stockBajo } = {}) {
            const conditions = [];
            const params = [];

            if (stockBajo === true) {
                conditions.push(
                    'COALESCE(s.stock_actual, 0) <= COALESCE(s.stock_minimo, 0)'
                );
            }

            const where = conditions.length
                ? `WHERE ${conditions.join(' AND ')}`
                : '';

            const [rows] = await pool.execute(`
                SELECT
                    p.id AS idProducto,
                    p.nombre,
                    p.precio AS precioUnitario,
                    p.imagen,
                    COALESCE(s.stock_actual, 0) AS stock,
                    COALESCE(s.stock_minimo, 0) AS stockMinimo,
                    COALESCE(s.stock_maximo, 0) AS stockMaximo
                FROM productos p
                LEFT JOIN stock s
                    ON s.id_producto = p.id
                ${where}
                ORDER BY p.id
            `, params);

            return rows;
        }
    };
}
