import './setup.js';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { crearAplicacion } from '../src/app.js';
import { pool, verificarMySQL } from '../src/config/baseDatos.js';
import { generarHash } from '../src/utils/passwords.js';

const app = crearAplicacion();
const estadoMySQL = await verificarMySQL();
const disponible = estadoMySQL.conectado;

const CREDENCIALES = {
  nombreUsuario: 'cliente_prueba',
  contrasena: 'ClavePrueba123'
};

async function prepararUsuario() {
  const hash = await generarHash(CREDENCIALES.contrasena);
  const [rol] = await pool.execute('SELECT id FROM roles WHERE nombre = ?', ['CLIENTE']);
  const rolId = rol[0].id;

  await pool.execute('DELETE FROM usuarios WHERE nombre_usuario = ?', [CREDENCIALES.nombreUsuario]);
  const [resultado] = await pool.execute(
    'INSERT INTO usuarios (nombre_usuario, password_hash, rol_id, activo) VALUES (?, ?, ?, 1)',
    [CREDENCIALES.nombreUsuario, hash, rolId]
  );
  return resultado.insertId;
}

async function limpiarUsuario() {
  await pool.execute('DELETE FROM usuarios WHERE nombre_usuario = ?', [CREDENCIALES.nombreUsuario]);
}

const opciones = {
  skip: disponible
    ? false
    : `MySQL no esta disponible (${estadoMySQL.error}). Ejecute "npm run db:schema" y "npm run db:usuarios".`
};

test('GET /api/v1/salud reporta el estado de la conexion con MySQL', async (t) => {
  const respuesta = await request(app).get('/api/v1/salud');
  assert.equal(respuesta.status, disponible ? 200 : 503);
  assert.equal(respuesta.body.datos.baseDatos.conectado, disponible);
  t.diagnostic(`MySQL: ${disponible ? 'disponible' : estadoMySQL.error}`);
});

test('login exitoso devuelve rol, identificador y token JWT', { ...opciones }, async () => {
  const idUsuario = await prepararUsuario();

  const respuesta = await request(app).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);

  assert.equal(respuesta.body.exito, true);
  assert.equal(respuesta.body.mensaje, 'Autenticacion exitosa');
  assert.equal(respuesta.body.datos.autenticado, true);
  assert.equal(respuesta.body.datos.rol, 'CLIENTE');
  assert.equal(respuesta.body.datos.idUsuario, idUsuario);
  assert.equal(respuesta.body.datos.nombreUsuario, CREDENCIALES.nombreUsuario);
  assert.equal(respuesta.body.datos.tipoToken, 'Bearer');
  assert.ok(respuesta.body.datos.token.split('.').length === 3);
  assert.equal(respuesta.body.datos.expiraEn, 900);
  assert.equal(respuesta.body.datos.passwordHash, undefined);

  const verificacion = await request(app)
    .get('/api/v1/auth/verificar')
    .set('Authorization', `Bearer ${respuesta.body.datos.token}`)
    .expect(200);

  assert.equal(verificacion.body.datos.idUsuario, idUsuario);
  assert.equal(verificacion.body.datos.rol, 'CLIENTE');

  await limpiarUsuario();
});

test('contrasena incorrecta responde 401 sin revelar si el usuario existe', { ...opciones }, async () => {
  await prepararUsuario();

  const respuesta = await request(app)
    .post('/api/v1/auth/login')
    .send({ ...CREDENCIALES, contrasena: 'ContrasenaEquivocada1' })
    .expect(401);

  assert.equal(respuesta.body.exito, false);
  assert.equal(respuesta.body.codigo, 'CREDENCIALES_INVALIDAS');
  assert.equal(respuesta.body.datos, undefined);
  assert.equal(respuesta.body.mensaje, 'Credenciales invalidas');

  await limpiarUsuario();
});

test('usuario inexistente responde 401 con el mismo mensaje', { ...opciones }, async () => {
  const respuesta = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: 'usuario_que_no_existe', contrasena: 'Algo12345' })
    .expect(401);

  assert.equal(respuesta.body.codigo, 'CREDENCIALES_INVALIDAS');
  assert.equal(respuesta.body.mensaje, 'Credenciales invalidas');
});

test('usuario inactivo responde 403 con el codigo USUARIO_INACTIVO', { ...opciones }, async () => {
  const idUsuario = await prepararUsuario();
  await pool.execute('UPDATE usuarios SET activo = 0 WHERE id = ?', [idUsuario]);

  const respuesta = await request(app).post('/api/v1/auth/login').send(CREDENCIALES).expect(403);

  assert.equal(respuesta.body.exito, false);
  assert.equal(respuesta.body.codigo, 'USUARIO_INACTIVO');
  assert.ok(respuesta.body.mensaje.includes('inactivo'));

  await limpiarUsuario();
});

test('usuario bloqueado temporalmente responde 423', { ...opciones }, async () => {
  const idUsuario = await prepararUsuario();
  await pool.execute(
    "UPDATE usuarios SET bloqueado_hasta = DATE_ADD(NOW(), INTERVAL 10 MINUTE) WHERE id = ?",
    [idUsuario]
  );

  const respuesta = await request(app).post('/api/v1/auth/login').send(CREDENCIALES).expect(423);

  assert.equal(respuesta.body.codigo, 'USUARIO_BLOQUEADO');

  await limpiarUsuario();
});

test('tras 5 intentos fallidos la cuenta queda bloqueada', { ...opciones }, async () => {
  const idUsuario = await prepararUsuario();

  for (let intento = 1; intento <= 5; intento += 1) {
    const respuesta = await request(app)
      .post('/api/v1/auth/login')
      .send({ ...CREDENCIALES, contrasena: 'ContrasenaEquivocada1' })
      .expect(401);
    assert.equal(respuesta.body.codigo, 'CREDENCIALES_INVALIDAS');
  }

  const bloqueo = await request(app).post('/api/v1/auth/login').send(CREDENCIALES).expect(423);
  assert.equal(bloqueo.body.codigo, 'USUARIO_BLOQUEADO');

  const [filas] = await pool.execute('SELECT intentos_fallidos, bloqueado_hasta FROM usuarios WHERE id = ?', [
    idUsuario
  ]);
  assert.equal(filas[0].intentos_fallidos, 5);
  assert.ok(filas[0].bloqueado_hasta !== null);

  await limpiarUsuario();
});

test('un login exitoso reinicia el contador de intentos fallidos', { ...opciones }, async () => {
  const idUsuario = await prepararUsuario();

  await request(app)
    .post('/api/v1/auth/login')
    .send({ ...CREDENCIALES, contrasena: 'ContrasenaEquivocada1' })
    .expect(401);

  await request(app).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);

  const [filas] = await pool.execute('SELECT intentos_fallidos, ultimo_acceso FROM usuarios WHERE id = ?', [
    idUsuario
  ]);
  assert.equal(filas[0].intentos_fallidos, 0);
  assert.ok(filas[0].ultimo_acceso !== null);

  await limpiarUsuario();
});

test('el login nunca expone el hash de la contrasena', { ...opciones }, async () => {
  await prepararUsuario();

  const respuesta = await request(app).post('/api/v1/auth/login').send(CREDENCIALES).expect(200);
  const serializado = JSON.stringify(respuesta.body);

  assert.ok(!serializado.includes('$2a$'));
  assert.ok(!serializado.includes('$2b$'));
  assert.ok(!('passwordHash' in respuesta.body.datos));

  await limpiarUsuario();
});

const NUEVO_USUARIO = {
  nombreUsuario: 'nuevo_cliente_prueba',
  contrasena: 'ClaveNueva123',
  email: 'nuevo@prueba.com',
  nombreCompleto: 'Cliente de Registro'
};

async function eliminarNuevoUsuario() {
  await pool.execute('DELETE FROM usuarios WHERE nombre_usuario = ?', [NUEVO_USUARIO.nombreUsuario]);
}

test('registro exitoso crea la cuenta con rol CLIENTE y la devuelve autenticada', { ...opciones }, async () => {
  await eliminarNuevoUsuario();

  const respuesta = await request(app).post('/api/v1/auth/registro').send(NUEVO_USUARIO).expect(201);

  assert.equal(respuesta.body.exito, true);
  assert.equal(respuesta.body.operacion, 'REGISTRAR_USUARIO');
  assert.equal(respuesta.body.datos.autenticado, true);
  assert.equal(respuesta.body.datos.rol, 'CLIENTE');
  assert.equal(respuesta.body.datos.nombreUsuario, NUEVO_USUARIO.nombreUsuario);
  assert.equal(respuesta.body.datos.email, NUEVO_USUARIO.email);
  assert.ok(respuesta.body.datos.token.split('.').length === 3);
  assert.equal(respuesta.body.datos.passwordHash, undefined);

  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: NUEVO_USUARIO.nombreUsuario, contrasena: NUEVO_USUARIO.contrasena })
    .expect(200);

  assert.equal(login.body.datos.rol, 'CLIENTE');

  await eliminarNuevoUsuario();
});

test('registro con un nombre de usuario ya existente responde 409', { ...opciones }, async () => {
  await eliminarNuevoUsuario();
  await request(app).post('/api/v1/auth/registro').send(NUEVO_USUARIO).expect(201);

  const duplicado = await request(app)
    .post('/api/v1/auth/registro')
    .send({ ...NUEVO_USUARIO, email: 'otro@prueba.com' })
    .expect(409);

  assert.equal(duplicado.body.exito, false);
  assert.equal(duplicado.body.codigo, 'USUARIO_YA_EXISTE');
  assert.ok(duplicado.body.mensaje.includes('nombre de usuario'));

  await eliminarNuevoUsuario();
});

test('registro con un email ya registrado responde 409', { ...opciones }, async () => {
  await eliminarNuevoUsuario();
  await request(app).post('/api/v1/auth/registro').send(NUEVO_USUARIO).expect(201);

  const duplicado = await request(app)
    .post('/api/v1/auth/registro')
    .send({ ...NUEVO_USUARIO, nombreUsuario: 'otro_nombre_prueba' })
    .expect(409);

  assert.equal(duplicado.body.codigo, 'USUARIO_YA_EXISTE');
  await pool.execute('DELETE FROM usuarios WHERE nombre_usuario = ?', ['otro_nombre_prueba']);

  await eliminarNuevoUsuario();
});

after(async () => {
  if (disponible) await pool.end();
});
