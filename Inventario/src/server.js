import { createPool } from './db.js';
import { createInventoryRepository } from './repositories/inventory.repository.js';
import { createApp } from './app.js';

const pool = createPool();
const port = Number(process.env.PORT || 3008);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválido');
const host = process.env.HOST || '0.0.0.0';
const server = createApp(createInventoryRepository(pool)).listen(port, host, () => {
  console.log(`Servicio escuchando en ${host}:${port}`);
});
let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const timer = setTimeout(() => process.exit(1), 10000);
  timer.unref();
  server.close(async () => {
    await pool.end();
    clearTimeout(timer);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
