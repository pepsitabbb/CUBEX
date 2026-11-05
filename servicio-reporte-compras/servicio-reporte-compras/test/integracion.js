// Requiere npm start en otra terminal y los datos originales del SQL.
import assert from 'node:assert/strict';
const host = process.env.BASE_URL || 'http://127.0.0.1:3000';
const base = '/api/v1/reportes/compras';
async function get(path, status = 200) {
  const r = await fetch(host + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(r.status, status, path);
  assert.match(r.headers.get('content-type'), /application\/json/);
  return r.json();
}
try {
  await get('/api/v1/salud');
  const periodo = '?desde=2026-09-01&hasta=2026-09-30';
  const resumen = (await get(base + '/resumen' + periodo)).datos;
  assert.equal(Number(resumen.totalCompras), 3);
  assert.equal(resumen.totalGastado, '10700.00');
  assert.equal(resumen.promedioPorCompra, '3566.67');
  const lista = await get(base + periodo + '&limite=2');
  assert.deepEqual(lista.datos.map(x => x.compraId), [3, 2]);
  assert.equal(lista.paginacion.totalRegistros, 3);
  assert.equal(lista.paginacion.totalPaginas, 2);
  const pagina2 = await get(base + periodo + '&limite=2&pagina=2');
  assert.deepEqual(pagina2.datos.map(x => x.compraId), [1]);
  const proveedor = (await get(base + '/resumen' + periodo + '&proveedorId=1')).datos;
  assert.equal(proveedor.totalGastado, '8700.00');
  const detalle = (await get(base + '/1')).datos;
  assert.equal(detalle.total, '6500.00'); assert.equal(detalle.productos.length, 2);
  assert.equal((await get(base + '/4')).datos.estado, 'CANCELADA');
  const vacio = await get(base + '/resumen?desde=2020-01-01&hasta=2020-01-31');
  assert.equal(vacio.datos.totalGastado, '0.00');
  await get(base + '/999999', 404);
  await get(base + '?desde=2026-02-30', 400);
  await get(base + '?proveedorId=1%20OR%201=1', 400);
  console.log('OK: salud, SQL, totales, filtros, paginación, detalle y errores comprobados.');
} catch (error) {
  console.error('Prueba fallida:', error.message);
  console.error('Comprueba que npm start esté activo y que uses los datos originales del SQL.');
  process.exitCode = 1;
}
