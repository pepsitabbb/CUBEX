// Vista de lectura: cada fila representa UNA compra; evita duplicar totales
// al unir la cabecera con sus múltiples productos.
function condiciones(filtro) {
  const partes = ['1=1'];
  const parametros = [];
  if (filtro.desde) { partes.push('fecha >= ?'); parametros.push(filtro.desde); }
  if (filtro.hasta) { partes.push('fecha <= ?'); parametros.push(filtro.hasta); }
  if (filtro.proveedorId) { partes.push('proveedorId = ?'); parametros.push(filtro.proveedorId); }
  return { where: partes.join(' AND '), parametros };
}

export function crearRepositorio(pool) {
  return {
    async salud() { await pool.execute('SELECT 1'); },
    async listar(filtro) {
      const { where, parametros } = condiciones(filtro);
      // Transacción de lectura: conteo y página observan el mismo estado.
      const connection = await pool.getConnection();
      try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
        const [[{ totalRegistros }]] = await connection.execute(
          `SELECT COUNT(*) AS totalRegistros FROM v_reporte_compras WHERE ${where}`, parametros);
        // LIMIT/OFFSET son enteros ya validados, nunca texto enviado por el cliente.
        const offset = (filtro.pagina - 1) * filtro.limite;
        const [datos] = await connection.execute(
          `SELECT * FROM v_reporte_compras WHERE ${where}
           ORDER BY fecha DESC, compraId DESC LIMIT ${filtro.limite} OFFSET ${offset}`, parametros);
        await connection.commit();
        return { datos, paginacion: { pagina: filtro.pagina, limite: filtro.limite,
          totalRegistros: Number(totalRegistros),
          totalPaginas: Math.ceil(Number(totalRegistros) / filtro.limite) } };
      } catch (error) { await connection.rollback(); throw error; }
      finally { connection.release(); }
    },
    async resumen(filtro) {
      const { where, parametros } = condiciones(filtro);
      const [[datos]] = await pool.execute(
        `SELECT COUNT(*) AS totalCompras,
          CAST(COALESCE(SUM(total), 0) AS DECIMAL(30,2)) AS totalGastado,
          CAST(COALESCE(AVG(total), 0) AS DECIMAL(30,2)) AS promedioPorCompra
         FROM v_reporte_compras WHERE ${where}`, parametros);
      return { ...datos, totalCompras: Number(datos.totalCompras) };
    },
    async detalle(id) {
      // Una consulta obtiene cabecera y líneas con una sola instantánea.
      const [filas] = await pool.execute(
        `SELECT c.id AS compraId, c.fecha, c.estado, p.id AS proveedorId,
          p.nombre AS proveedor, d.id AS detalleId, pr.id AS productoId,
          pr.nombre AS producto, d.cantidad, d.precio_unitario AS precioUnitario,
          CAST(d.cantidad * d.precio_unitario AS DECIMAL(20,2)) AS subtotal,
          CAST(SUM(d.cantidad * d.precio_unitario) OVER () AS DECIMAL(30,2)) AS total
         FROM compras c JOIN proveedores p ON p.id = c.proveedor_id
         JOIN detalle_compras d ON d.compra_id = c.id
         JOIN productos pr ON pr.id = d.producto_id
         WHERE c.id = ? ORDER BY d.id`, [id]);
      if (!filas.length) return null;
      const { compraId, fecha, estado, proveedorId, proveedor, total } = filas[0];
      return { compraId, fecha, estado, proveedorId, proveedor, moneda: 'MXN', total,
        productos: filas.map(({ productoId, producto, cantidad, precioUnitario, subtotal }) =>
          ({ productoId, producto, cantidad, precioUnitario, subtotal })) };
    }
  };
}
