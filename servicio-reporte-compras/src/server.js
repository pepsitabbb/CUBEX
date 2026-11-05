import mysql from 'mysql2/promise';
import { crearApp } from './app.js';
import { crearRepositorio } from './reportes.js';

for (const clave of ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) {
  if (!process.env[clave]) throw new Error(`Falta configurar ${clave} en .env`);
}
const puerto = Number(process.env.PORT || 3010);
const puertoBD = Number(process.env.DB_PORT || 3306);
for (const numero of [puerto, puertoBD]) {
  if (!Number.isInteger(numero) || numero < 1 || numero > 65535) throw new Error('Puerto inválido.');
}
const pool = mysql.createPool({
  host: process.env.DB_HOST, port: puertoBD, user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  waitForConnections: true, connectionLimit: 5, queueLimit: 20,
  connectTimeout: 10000, dateStrings: true,
  supportBigNumbers: true, bigNumberStrings: true
});
// Los DECIMAL se mantienen como strings para no perder precisión monetaria.
const app = crearApp(crearRepositorio(pool));
const servidor = app.listen(puerto, '0.0.0.0', () => {
  console.log(`Servicio disponible en http://${process.env.HOST || '127.0.0.1'}:${puerto}/api/v1/salud`);
});
servidor.on('error', async error => {
  console.error('No se pudo iniciar:', error.code);
  await pool.end(); process.exitCode = 1;
});
function cerrar() {
  servidor.close(async () => { await pool.end(); process.exitCode = 0; });
}
process.once('SIGINT', cerrar);
process.once('SIGTERM', cerrar);
