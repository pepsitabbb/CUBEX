"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const prisma_1 = require("./config/prisma");
const PORT = Number(process.env.PORT || 3024);
const server = app_1.app.listen(PORT, () => console.log(`Servicio de verificación de tarjetas en http://localhost:${PORT}`));
async function cerrar() { server.close(); await prisma_1.prisma.$disconnect(); process.exit(0); }
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
