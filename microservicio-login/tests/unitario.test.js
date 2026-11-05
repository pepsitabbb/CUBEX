import './setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearAplicacion } from '../src/app.js';
import { generarHash, verificarPassword } from '../src/utils/passwords.js';
import { firmarToken, verificarToken, segundaADatos } from '../src/utils/jwt.js';

const app = crearAplicacion();

test('GET / responde con la informacion del microservicio', async () => {
  const respuesta = await request(app).get('/').expect(200);

  assert.equal(respuesta.body.exito, true);
  assert.equal(respuesta.body.datos.version, '1.0.0');
  assert.ok(Array.isArray(respuesta.body.datos.endpoints));
});

test('GET /api/v1/estado informa que el servicio esta operativo', async () => {
  const respuesta = await request(app).get('/api/v1/estado').expect(200);

  assert.equal(respuesta.body.exito, true);
  assert.equal(respuesta.body.datos.servicio, 'microservicio-login');
});

test('GET a una ruta inexistente responde 404 en formato JSON', async () => {
  const respuesta = await request(app).get('/api/v1/no-existe').expect(404);

  assert.equal(respuesta.body.exito, false);
  assert.equal(respuesta.body.codigo, 'RUTA_NO_ENCONTRADA');
  assert.ok(respuesta.body.mensaje.includes('/api/v1/no-existe'));
});

test('POST login con cuerpo vacio responde 422 detailing los campos', async () => {
  const respuesta = await request(app).post('/api/v1/auth/login').send({}).expect(422);

  assert.equal(respuesta.body.exito, false);
  assert.equal(respuesta.body.codigo, 'DATOS_INVALIDOS');
  const campos = respuesta.body.detalles.map((detalle) => detalle.campo);
  assert.deepEqual(campos.sort(), ['contrasena', 'nombreUsuario']);
});

test('POST login con nombre de usuario muy corto responde 422', async () => {
  const respuesta = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: 'ab', contrasena: 'algo' })
    .expect(422);

  assert.equal(respuesta.body.exito, false);
  assert.ok(respuesta.body.detalles.some((detalle) => detalle.campo === 'nombreUsuario'));
});

test('POST registro con cuerpo vacio responde 422 detallando los campos', async () => {
  const respuesta = await request(app).post('/api/v1/auth/registro').send({}).expect(422);

  assert.equal(respuesta.body.exito, false);
  assert.equal(respuesta.body.codigo, 'DATOS_INVALIDOS');
  const campos = respuesta.body.detalles.map((detalle) => detalle.campo);
  assert.deepEqual(campos.sort(), ['contrasena', 'nombreUsuario']);
});

test('POST registro exige una contrasena de al menos 8 caracteres', async () => {
  const respuesta = await request(app)
    .post('/api/v1/auth/registro')
    .send({ nombreUsuario: 'nuevo_cliente', contrasena: 'corta' })
    .expect(422);

  assert.ok(respuesta.body.detalles.some((detalle) => detalle.campo === 'contrasena'));
});

test('POST registro rechaza un email con formato invalido', async () => {
  const respuesta = await request(app)
    .post('/api/v1/auth/registro')
    .send({ nombreUsuario: 'nuevo_cliente', contrasena: 'ClaveSegura123', email: 'no-es-un-email' })
    .expect(422);

  assert.equal(respuesta.body.codigo, 'DATOS_INVALIDOS');
  assert.ok(respuesta.body.detalles.some((detalle) => detalle.campo === 'email'));
});

test('POST login con JSON mal formado responde 400', async () => {
  const respuesta = await request(app)
    .post('/api/v1/auth/login')
    .set('Content-Type', 'application/json')
    .send('{"nombreUsuario": ');

  assert.equal(respuesta.status, 400);
  assert.equal(respuesta.body.codigo, 'JSON_MAL_FORMADO');
});

test('GET /auth/verificar sin cabecera Authorization responde 401', async () => {
  const respuesta = await request(app).get('/api/v1/auth/verificar').expect(401);

  assert.equal(respuesta.body.exito, false);
  assert.equal(respuesta.body.codigo, 'TOKEN_INVALIDO');
  assert.ok(respuesta.body.mensaje.includes('Authorization'));
});

test('GET /auth/verificar con token invalido responde 401', async () => {
  const respuesta = await request(app)
    .get('/api/v1/auth/verificar')
    .set('Authorization', 'Bearer token.invalido.firma')
    .expect(401);

  assert.equal(respuesta.body.exito, false);
  assert.ok(respuesta.body.mensaje.includes('no es valido'));
});

test('GET /auth/verificar con un token correctamente firmado responde 200 con el rol', async () => {
  const token = firmarToken({ id: 42, nombreUsuario: 'cliente', rol: 'CLIENTE', email: 'cliente@ventasonline.com' });

  const respuesta = await request(app)
    .get('/api/v1/auth/verificar')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(respuesta.body.datos.autenticado, true);
  assert.equal(respuesta.body.datos.idUsuario, 42);
  assert.equal(respuesta.body.datos.rol, 'CLIENTE');
});

test('GET /auth/admin/panel rechaza a un rol distinto de ADMIN', async () => {
  const token = firmarToken({ id: 7, nombreUsuario: 'vendedor', rol: 'VENDEDOR' });

  const respuesta = await request(app)
    .get('/api/v1/auth/admin/panel')
    .set('Authorization', `Bearer ${token}`)
    .expect(403);

  assert.equal(respuesta.body.exito, false);
  assert.equal(respuesta.body.codigo, 'ACCESO_DENEGADO');
  assert.deepEqual(respuesta.body.detalles.rolRequerido, ['ADMIN']);
});

test('GET /auth/admin/panel permite el acceso a un ADMIN', async () => {
  const token = firmarToken({ id: 1, nombreUsuario: 'admin', rol: 'ADMIN' });

  const respuesta = await request(app)
    .get('/api/v1/auth/admin/panel')
    .set('Authorization', `Bearer ${token}`)
    .expect(200);

  assert.equal(respuesta.body.operacion, 'PANEL_ADMIN');
});

test('las contrasenas se guardan como hash bcrypt y se verifican correctamente', async () => {
  const hash = await generarHash('ClaveDemo123');

  assert.notEqual(hash, 'ClaveDemo123');
  assert.match(hash, /^\$2[aby]\$\d{2}\$/);
  assert.equal(await verificarPassword('ClaveDemo123', hash), true);
  assert.equal(await verificarPassword('claveIncorrecta', hash), false);
});

test('el token firmado contiene sub, rol y nombre de usuario, y expira', () => {
  const token = firmarToken({ id: 99, nombreUsuario: 'admin', rol: 'ADMIN' });
  const contenido = verificarToken(token);

  assert.equal(contenido.sub, '99');
  assert.equal(contenido.rol, 'ADMIN');
  assert.equal(contenido.nombreUsuario, 'admin');
  assert.equal(contenido.iss, 'microservicio-login');
  assert.ok(contenido.exp > contenido.iat);
});

test('un token firmado con otra clave es rechazado', () => {
  const tokenFalso = firmarToken({ id: 1, nombreUsuario: 'admin', rol: 'ADMIN' })
    .split('.')
    .map((parte, indice) => (indice === 2 ? parte.split('').reverse().join('') : parte))
    .join('.');

  assert.throws(() => verificarToken(tokenFalso));
});

test('segundaADatos convierte la vigencia de JWT a segundos', () => {
  assert.equal(segundaADatos('15m'), 900);
  assert.equal(segundaADatos('2h'), 7200);
  assert.equal(segundaADatos('30'), 30);
});
