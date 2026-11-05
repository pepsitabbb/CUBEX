/* Arranca inventario (3105) y pedidos (3111) reales sobre un archivo SQLite. */
const path = require('path');
const Module = require('module');
const { DatabaseSync } = require('node:sqlite');
const simulado = require('./mysql2-simulado');

const RAIZ = path.resolve(__dirname, '../..');
const db = new DatabaseSync(process.env.SQLITE_DB);
db.exec('PRAGMA busy_timeout = 8000; PRAGMA foreign_keys = ON;');
const pool = simulado.crear(db);

const cargaOriginal = Module._load;
Module._load = function (solicitud) {
    if (solicitud === 'mysql2/promise') return { createPool: () => pool };
    return cargaOriginal.apply(this, arguments);
};

process.env.PORT = process.env.PUERTO_INV || '3105';
require(path.join(RAIZ, 'inventario-service-main/src/app.js'));
process.env.PORT = process.env.PUERTO_PED || '3111';
require(path.join(RAIZ, 'registro-pedidos-service/server.js'));
