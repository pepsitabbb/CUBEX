import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createPool } from '../src/db.js';
import { createInventoryRepository } from '../src/repositories/inventory.repository.js';
import { createApp } from '../src/app.js';

// Solo lectura: utiliza los datos existentes, sin crear ni borrar registros.
// Ejecutar sin modificar el inventario simultáneamente para comparar totales.
test('MySQL real: salud, filtros y totales del reporte HTTP', async () => {
  const pool = createPool();
  let server;
  try {
    try {
      await pool.query('SELECT 1');
    } catch (error) {
      throw new Error(`No se pudo conectar a MySQL (${error.code ?? 'ERROR'}). Revisa .env y los permisos del usuario.`);
    }
    server = createApp(createInventoryRepository(pool)).listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: 'ok', database: 'up' });

    const cases = [
      ['', ''],
      ['?categoriaId=1', 'WHERE categoria_id = 1'],
      ['?stockBajo=true', 'WHERE stock <= stock_minimo'],
      ['?categoriaId=2&stockBajo=true', 'WHERE categoria_id = 2 AND stock <= stock_minimo'],
      ['?stockBajo=false', '']
    ];
    for (const [query, where] of cases) {
      // Comprobación independiente: MySQL calcula los totales con DECIMAL.
      // "where" contiene exclusivamente constantes de esta prueba.
      const [[expected]] = await pool.query(`
        SELECT COUNT(*) AS productos,
               CAST(COALESCE(SUM(stock), 0) AS CHAR) AS unidades,
               CAST(COALESCE(SUM(stock * precio_unitario), 0.00) AS CHAR) AS valor,
               CAST(COALESCE(SUM(stock <= stock_minimo), 0) AS UNSIGNED) AS bajo,
               CAST(COALESCE(SUM(stock = 0), 0) AS UNSIGNED) AS sinStock
        FROM productos ${where}`);
      const response = await fetch(`${base}/api/v1/reportes/inventario${query}`);
      assert.equal(response.status, 200, query);
      assert.match(response.headers.get('content-type'), /application\/json/);
      const { data } = await response.json();
      assert.deepEqual(data.resumen, {
        totalProductos: Number(expected.productos),
        totalUnidades: expected.unidades,
        valorInventario: expected.valor,
        productosStockBajo: Number(expected.bajo),
        productosSinStock: Number(expected.sinStock)
      }, query);
      assert.equal(data.productos.length, Number(expected.productos));
    }
  } finally {
    if (server) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
