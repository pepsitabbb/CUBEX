"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.obtenerClienteDeUsuario = obtenerClienteDeUsuario;
const prisma_1 = require("../config/prisma");
async function obtenerClienteDeUsuario(idUsuario) {
    return prisma_1.prisma.clientes.findFirst({ where: { id_usuario: idUsuario } });
}
