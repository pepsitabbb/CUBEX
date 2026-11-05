import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearApp } from '../src/app.js';

async function consultar(path, repo = {}) {
  const app = crearApp({ salud: async () => {}, ...repo });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { status: response.status, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}
const base = '/api/v1/reportes/compras';
test('salud comprueba repositorio', async () => {
  const r = await consultar('/api/v1/salud');
  assert.equal(r.status, 200); assert.equal(r.body.baseDatos, 'conectada');
});
test('salud devuelve 503 cuando falla MySQL', async () => {
  const r = await consultar('/api/v1/salud', { salud: async () => { throw Error(); } });
  assert.equal(r.status, 503);
});
for (const query of ['desde=2026-02-30','desde=ayer','desde=2026-09-30&hasta=2026-09-01',
  'proveedorId=1%20OR%201=1','limite=101','pagina=0','desde=2026-09-01&desde=2026-09-02','extra=x']) {
  test(`rechaza ${query} antes de consultar BD`, async () => {
    const r = await consultar(`${base}?${query}`);
    assert.equal(r.status, 400); assert.equal(r.body.ok, false);
  });
}
test('lista vacía es 200 y conserva filtros', async () => {
  const r = await consultar(`${base}?proveedorId=999`, { listar: async filtro => {
    assert.equal(filtro.proveedorId, 999); assert.equal(filtro.limite, 20);
    return { datos: [], paginacion: { pagina: 1, limite: 20, totalRegistros: 0, totalPaginas: 0 } };
  }});
  assert.equal(r.status, 200); assert.deepEqual(r.body.datos, []);
});
test('resumen es ruta fija, no identificador', async () => {
  const r = await consultar(`${base}/resumen`, { resumen: async () => ({ totalCompras: 3, totalGastado: '10700.00' }) });
  assert.equal(r.status, 200); assert.equal(r.body.datos.totalGastado, '10700.00');
});
test('compra inexistente devuelve 404', async () => {
  const r = await consultar(`${base}/999`, { detalle: async () => null });
  assert.equal(r.status, 404);
});
test('no expone errores internos', async () => {
  const r = await consultar(base, { listar: async () => { throw Error('clave secreta'); } });
  assert.equal(r.status, 500); assert.ok(!JSON.stringify(r.body).includes('clave secreta'));
});
