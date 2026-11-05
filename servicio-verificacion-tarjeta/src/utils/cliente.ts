import { prisma } from "../config/prisma";
export async function obtenerClienteDeUsuario(idUsuario: number) {
  return prisma.clientes.findFirst({ where: { id_usuario: idUsuario } });
}
