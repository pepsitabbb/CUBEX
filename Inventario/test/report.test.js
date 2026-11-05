import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { createReportService, parseFilters } from '../src/services/report.service.js';
import { createInventoryRepository } from '../src/repositories/inventory.repository.js';

const rows = [
  { id: 1, stock: 3, stockMinimo: 3, precioUnitario: '0.10' },
  { id: 2, stock: 0, stockMinimo: 1, precioUnitario: '150.00' }
];
test('Calcula importes exactos y cuenta el umbral inclusivo y stock cero', async () => {
  const result = await createReportService({ findProducts: async () => rows }).generate({});
  assert.deepEqual(result.resumen, { totalProductos: 2, totalUnidades: '3', valorInventario: '0.30', productosStockBajo: 2, productosSinStock: 1 });
});
test('Reporte vacío tiene totales en cero', async () => {
  const result = await createReportService({ findProducts: async () => [] }).generate({});
  assert.equal(result.resumen.valorInventario, '0.00');
  assert.deepEqual(result.productos, []);
});
test('Rechaza filtros ambiguos, repetidos y desconocidos', () => {
  for (const query of [{ categoriaId: '-1' }, { categoriaId: '1 OR 1=1' }, { categoriaId: ['1', '2'] }, { stockBajo: 'yes' }, { otro: '1' }]) {
    assert.throws(() => parseFilters(query));
  }
  assert.deepEqual(parseFilters({ categoriaId: '2', stockBajo: 'false' }), { categoriaId: 2, stockBajo: false });
});
test('Repositorio combina filtros con SQL parametrizado', async () => {
  const repo = createInventoryRepository({ execute: async (sql, params) => {
    assert.match(sql, /p.categoria_id = \?/);
    assert.match(sql, /p.stock <= p.stock_minimo/);
    assert.deepEqual(params, [2]);
    return [[]];
  } });
  await repo.findProducts({ categoriaId: 2, stockBajo: true });
});
test('Contrato HTTP: 200, 400, 404, 500 y 503', async () => {
  let fail = false;
  const app = createApp({
    ping: async () => { if (fail) throw new Error('privado'); },
    findProducts: async filters => {
      if (fail) throw new Error('credenciales privadas');
      assert.deepEqual(filters, { categoriaId: 2, stockBajo: true });
      return rows;
    }
  }, { error() {} });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let res = await fetch(`${base}/api/v1/reportes/inventario?categoriaId=2&stockBajo=true`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.resumen.valorInventario, '0.30');
    assert.equal((await fetch(`${base}/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/v1/reportes/inventario?stockBajo=no`)).status, 400);
    assert.equal((await fetch(`${base}/inexistente`)).status, 404);
    fail = true;
    res = await fetch(`${base}/api/v1/reportes/inventario`);
    assert.equal(res.status, 500);
    assert.doesNotMatch(await res.text(), /credenciales/);
    assert.equal((await fetch(`${base}/health`)).status, 503);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
