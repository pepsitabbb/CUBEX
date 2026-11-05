import { variables } from '../src/config/entorno.js';
import { generarHash } from '../src/utils/passwords.js';
import { crearUsuario, buscarUsuarioPorNombre } from '../src/repositories/usuarios.repository.js';
import { cerrarPool } from '../src/config/baseDatos.js';
import { logger } from '../src/utils/logger.js';

const usuariosDemo = [
  { nombreUsuario: 'admin', contrasena: variables.USUARIOS_DEMO_PASSWORD, email: 'admin@ventasonline.com', nombreCompleto: 'Administrador General', rol: 'ADMIN' },
  { nombreUsuario: 'vendedor', contrasena: variables.USUARIOS_DEMO_PASSWORD, email: 'vendedor@ventasonline.com', nombreCompleto: 'Vendedor de Mostrador', rol: 'VENDEDOR' },
  { nombreUsuario: 'cliente', contrasena: variables.USUARIOS_DEMO_PASSWORD, email: 'cliente@ventasonline.com', nombreCompleto: 'Cliente de Prueba', rol: 'CLIENTE' },
  { nombreUsuario: 'inactivo', contrasena: variables.USUARIOS_DEMO_PASSWORD, email: 'inactivo@ventasonline.com', nombreCompleto: 'Usuario Deshabilitado', rol: 'CLIENTE' }
];

async function ejecutar() {
  logger.info(`Generando usuarios de prueba en la base de datos "${variables.DB_NAME}"...`);
  const contrasenaCifrada = await generarHash(variables.USUARIOS_DEMO_PASSWORD);

  for (const usuario of usuariosDemo) {
    const existente = await buscarUsuarioPorNombre(usuario.nombreUsuario);

    if (existente) {
      logger.warn(`El usuario "${usuario.nombreUsuario}" ya existe (id ${existente.id}). Se omite.`);
      continue;
    }

    const id = await crearUsuario({
      nombreUsuario: usuario.nombreUsuario,
      passwordHash: contrasenaCifrada,
      email: usuario.email,
      nombreCompleto: usuario.nombreCompleto,
      rol: usuario.rol
    });

    const activo = usuario.nombreUsuario === 'inactivo' ? 0 : 1;
    if (activo === 0) {
      const { pool } = await import('../src/config/baseDatos.js');
      await pool.execute('UPDATE usuarios SET activo = 0 WHERE id = ?', [id]);
    }

    logger.info(`Usuario creado -> id ${id} | ${usuario.nombreUsuario} | rol ${usuario.rol}${activo ? '' : ' | inactivo'}`);
  }

  logger.info('Usuarios de prueba listos. Contrasena compartida: la definida en USUARIOS_DEMO_PASSWORD.');
  logger.info('Tabla de usuarios resultante:');
  logger.info('  admin     -> ADMIN    (activo)');
  logger.info('  vendedor  -> VENDEDOR (activo)');
  logger.info('  cliente   -> CLIENTE  (activo)');
  logger.info('  inactivo  -> CLIENTE  (deshabilitado, demuestra el rechazo 403)');
}

ejecutar()
  .catch((error) => {
    logger.error(`No se pudieron crear los usuarios de prueba: ${error.message}`);
    logger.error('Ejecute primero "npm run db:schema" y revise las credenciales de .env.');
    process.exitCode = 1;
  })
  .finally(async () => {
    await cerrarPool().catch(() => {});
  });
