import { pool } from '../config/baseDatos.js';
import { ErrorBaseDatos } from '../utils/errores.js';
import { logger } from '../utils/logger.js';

const CAMPOS_USUARIO = `
  u.id,
  u.nombre_usuario     AS nombreUsuario,
  u.password_hash      AS passwordHash,
  u.email              AS email,
  u.nombre_completo    AS nombreCompleto,
  u.activo             AS activo,
  u.intentos_fallidos  AS intentosFallidos,
  u.bloqueado_hasta    AS bloqueadoHasta,
  u.ultimo_acceso      AS ultimoAcceso,
  r.nombre             AS rol
`;

function traducirError(error) {
  if (error.code === 'ECONNREFUSED' || error.code === 'PROTOCOL_CONNECTION_LOST' || error.code === 'ETIMEDOUT') {
    return new ErrorBaseDatos('No fue posible conectar con MySQL. Verifique que el servicio este encendido y los datos de .env sean correctos.');
  }
  if (error.code === 'ER_ACCESS_DENIED_ERROR') {
    return new ErrorBaseDatos('MySQL rechazo las credenciales definidas en .env.');
  }
  if (error.code === 'ER_BAD_DB_ERROR' || error.code === 'ER_NO_SUCH_TABLE') {
    return new ErrorBaseDatos(`La base de datos "${process.env.DB_NAME}" no existe o no tiene las tablas requeridas. Ejecute: npm run db:schema`);
  }
  return error;
}

export async function buscarUsuarioPorNombre(nombreUsuario) {
  const sql = `
    SELECT ${CAMPOS_USUARIO}
    FROM usuarios u
    INNER JOIN roles r ON r.id = u.rol_id
    WHERE u.nombre_usuario = ?
    LIMIT 1
  `;

  try {
    const [filas] = await pool.execute(sql, [nombreUsuario]);
    return filas[0] ?? null;
  } catch (error) {
    logger.error(`Error al consultar el usuario "${nombreUsuario}": ${error.message}`);
    throw traducirError(error);
  }
}

export async function registrarAcceso(idUsuario) {
  const sql = `
    UPDATE usuarios
    SET ultimo_acceso = NOW(), intentos_fallidos = 0, bloqueado_hasta = NULL
    WHERE id = ?
  `;
  try {
    await pool.execute(sql, [idUsuario]);
  } catch (error) {
    logger.warn(`No se pudo actualizar el ultimo acceso del usuario ${idUsuario}: ${error.message}`);
  }
}

export async function registrarIntentoFallido(idUsuario, maxIntentos, minutosBloqueo) {
  const incrementarContador = `
    UPDATE usuarios
    SET intentos_fallidos = intentos_fallidos + 1
    WHERE id = ?
  `;

  const aplicarBloqueo = `
    UPDATE usuarios
    SET bloqueado_hasta = DATE_ADD(NOW(), INTERVAL ? MINUTE)
    WHERE id = ? AND intentos_fallidos >= ?
  `;

  try {
    await pool.execute(incrementarContador, [idUsuario]);
    await pool.execute(aplicarBloqueo, [minutosBloqueo, idUsuario, maxIntentos]);
  } catch (error) {
    logger.warn(`No se pudo registrar el intento fallido del usuario ${idUsuario}: ${error.message}`);
  }
}

export async function crearUsuario({
    nombreUsuario,
    passwordHash,
    email,
    nombreCompleto,
    rol
}) {
    const conexion = await pool.getConnection();

    try {
        await conexion.beginTransaction();

        // 1. Crear usuario
        const sqlUsuario = `
            INSERT INTO usuarios (
                nombre_usuario,
                password_hash,
                email,
                nombre_completo,
                rol_id
            )
            SELECT ?, ?, ?, ?, id
            FROM roles
            WHERE nombre = ?
        `;

        const [resultadoUsuario] = await conexion.execute(sqlUsuario, [
            nombreUsuario,
            passwordHash,
            email ?? null,
            nombreCompleto ?? null,
            rol
        ]);

        if (resultadoUsuario.affectedRows === 0) {
            throw new Error(`El rol "${rol}" no existe en el catalogo de roles.`);
        }

        const idUsuario = resultadoUsuario.insertId;

        // 2. Crear cliente asociado al usuario
        const sqlCliente = `
            INSERT INTO clientes (id_usuario)
            VALUES (?)
        `;

        await conexion.execute(sqlCliente, [idUsuario]);

        // 3. Confirmar ambas inserciones
        await conexion.commit();

        return idUsuario;

    } catch (error) {
        await conexion.rollback();

        if (error.code === 'ER_DUP_ENTRY') {
            throw new ErrorAplicacion(
                'El nombre de usuario o el email ya estan registrados.',
                {
                    estadoHttp: 409,
                    codigo: 'USUARIO_YA_EXISTE'
                }
            );
        }

        throw traducirError(error);

    } finally {
        conexion.release();
    }
}