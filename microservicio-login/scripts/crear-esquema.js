import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { dbConfig } from '../src/config/entorno.js';
import { logger } from '../src/utils/logger.js';

const rutaEsquema = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'database', 'esquema.sql');

const reset = process.argv.includes('--reset');

async function ejecutar() {
  const sql = await readFile(rutaEsquema, 'utf8');
  const conexion = await mysql.createConnection({ ...dbConfig, multipleStatements: true });

  try {
    if (reset) {
      await conexion.query('DROP DATABASE IF EXISTS `?`'.replace('`?`', `\`${dbConfig.database}\``));
      logger.warn(`Base de datos ${dbConfig.database} eliminada. Se recreara desde cero.`);
    }

    await conexion.query(sql);
    logger.info(`Esquema aplicado correctamente en la base de datos "${dbConfig.database}".`);
  } finally {
    await conexion.end();
  }
}

ejecutar().catch((error) => {
  logger.error(`No se pudo aplicar el esquema: ${error.message}`);
  logger.error('Verifica que MySQL este detenido, las credenciales de .env sean correctas y el usuario tenga permisos.');
  process.exitCode = 1;
});
