
// Repositorio del servicio de reportes de compras CUBEX.
// Base de datos: tienda_db

function condiciones(filtro) {
  const partes = ['1=1'];
  const parametros = [];

  if (filtro.desde) {
    partes.push('DATE(c.fecha) >= ?');
    parametros.push(filtro.desde);
  }

  if (filtro.hasta) {
    partes.push('DATE(c.fecha) <= ?');
    parametros.push(filtro.hasta);
  }

  if (filtro.proveedorId) {
    partes.push('c.id_proveedor = ?');
    parametros.push(filtro.proveedorId);
  }

  return {
    where: partes.join(' AND '),
    parametros
  };
}

export function crearRepositorio(pool) {
  return {

    // Comprobar conexión con MySQL
    async salud() {
      await pool.execute('SELECT 1');
    },

    // Listar compras: una fila por compra
    async listar(filtro) {
      const { where, parametros } = condiciones(filtro);

      const connection = await pool.getConnection();

      try {
        await connection.query(
          'SET TRANSACTION ISOLATION LEVEL REPEATABLE READ'
        );

        await connection.query(
          'START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY'
        );

        // Contar compras
        const [[{ totalRegistros }]] = await connection.execute(
          `SELECT COUNT(*) AS totalRegistros
           FROM compras c
           INNER JOIN proveedores p ON p.id = c.id_proveedor
           WHERE ${where}`,
          parametros
        );

        // Calcular paginación
        const offset = (filtro.pagina - 1) * filtro.limite;

        // Consultar compras sin duplicarlas por sus productos
        const [datos] = await connection.execute(
          `SELECT
              c.id AS compraId,
              c.fecha,
              c.estado,
              p.id AS proveedorId,
              p.nombre AS proveedor,
              c.total
           FROM compras c
           INNER JOIN proveedores p ON p.id = c.id_proveedor
           WHERE ${where}
           ORDER BY c.fecha DESC, c.id DESC
           LIMIT ${filtro.limite} OFFSET ${offset}`,
          parametros
        );

        await connection.commit();

        return {
          datos,
          paginacion: {
            pagina: filtro.pagina,
            limite: filtro.limite,
            totalRegistros: Number(totalRegistros),
            totalPaginas: Math.ceil(
              Number(totalRegistros) / filtro.limite
            )
          }
        };

      } catch (error) {
        await connection.rollback();
        throw error;

      } finally {
        connection.release();
      }
    },

    // Resumen general de compras
    async resumen(filtro) {
      const { where, parametros } = condiciones(filtro);

      const [[datos]] = await pool.execute(
        `SELECT
            COUNT(*) AS totalCompras,
            CAST(COALESCE(SUM(c.total), 0) AS DECIMAL(30,2))
              AS totalGastado,
            CAST(COALESCE(AVG(c.total), 0) AS DECIMAL(30,2))
              AS promedioPorCompra
         FROM compras c
         INNER JOIN proveedores p ON p.id = c.id_proveedor
         WHERE ${where}`,
        parametros
      );

      return {
        ...datos,
        totalCompras: Number(datos.totalCompras)
      };
    },

    // Consultar detalle de una compra
    async detalle(id) {
      const [filas] = await pool.execute(
        `SELECT
            c.id AS compraId,
            c.fecha,
            c.estado,
            c.total,
            p.id AS proveedorId,
            p.nombre AS proveedor,
            d.id AS detalleId,
            pr.id AS productoId,
            pr.nombre AS producto,
            d.cantidad,
            d.costo_unitario AS precioUnitario,
            CAST(
              d.cantidad * d.costo_unitario
              AS DECIMAL(20,2)
            ) AS subtotal
         FROM compras c
         INNER JOIN proveedores p
            ON p.id = c.id_proveedor
         INNER JOIN detalle_compras d
            ON d.id_compra = c.id
         INNER JOIN productos pr
            ON pr.id = d.id_producto
         WHERE c.id = ?
         ORDER BY d.id`,
        [id]
      );

      if (!filas.length) {
        return null;
      }

      const {
        compraId,
        fecha,
        estado,
        proveedorId,
        proveedor,
        total
      } = filas[0];

      return {
        compraId,
        fecha,
        estado,
        proveedorId,
        proveedor,
        moneda: 'MXN',
        total,
        productos: filas.map((fila) => ({
          detalleId: fila.detalleId,
          productoId: fila.productoId,
          producto: fila.producto,
          cantidad: fila.cantidad,
          precioUnitario: fila.precioUnitario,
          subtotal: fila.subtotal
        }))
      };
    }
  };
}
