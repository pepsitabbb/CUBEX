import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

async function main() {
  // ---------- Roles ----------
  const admin = await prisma.rol.upsert({
    where: { id: 1 },
    update: {},
    create: { nombreRol: "ADMIN", descripcion: "Administrador del sistema" },
  });

  const rolCliente = await prisma.rol.upsert({
    where: { id: 2 },
    update: {},
    create: { nombreRol: "CLIENTE", descripcion: "Cliente de la tienda" },
  });

  // ---------- Usuarios ----------
  const passwordAdmin = await bcrypt.hash("admin123", 10);
  const passwordCliente = await bcrypt.hash("cliente123", 10);

  await prisma.usuario.upsert({
    where: { correo: "admin@tienda.com" },
    update: {},
    create: {
      nombre: "Administrador Demo",
      correo: "admin@tienda.com",
      passwordHash: passwordAdmin,
      idRol: admin.id,
    },
  });

  const usuarioCliente = await prisma.usuario.upsert({
    where: { correo: "cliente@tienda.com" },
    update: {},
    create: {
      nombre: "Cliente Demo",
      correo: "cliente@tienda.com",
      passwordHash: passwordCliente,
      idRol: rolCliente.id,
    },
  });

  // ---------- Perfil de cliente (tabla CLIENTES) ----------
  // Necesario para guardar tarjetas y hacer pedidos.
  const cliente = await prisma.cliente.upsert({
    where: { idUsuario: usuarioCliente.id },
    update: {},
    create: { idUsuario: usuarioCliente.id },
  });

  // ---------- Tipos de pago ----------
  const nombresPago = [
    "Tarjeta de crédito/débito",
    "Transferencia",
    "Efectivo contra entrega",
    "Pago en tienda",
  ];
  for (const nombre of nombresPago) {
    await prisma.tipoPago.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }
  const pagoTarjeta = await prisma.tipoPago.findUniqueOrThrow({
    where: { nombre: "Tarjeta de crédito/débito" },
  });

  // ---------- Producto demo + pedido pendiente (para probar el pago) ----------
  const categoria = await prisma.categoria.upsert({
    where: { nombre: "Pasteles" },
    update: {},
    create: { nombre: "Pasteles", descripcion: "Pasteles y tartas para toda ocasión" },
  });

  let producto = await prisma.producto.findFirst({ where: { nombre: "Pastel de chocolate" } });
  if (!producto) {
    producto = await prisma.producto.create({
      data: {
        idCategoria: categoria.id,
        nombre: "Pastel de chocolate",
        descripcion: "Pastel de chocolate con ganache, 12 porciones",
        sabor: "Chocolate",
        porciones: 12,
        costo: 180,
        precio: 350,
        esPersonalizable: true,
        stock: { create: { stockActual: 5, stockMinimo: 2, stockMaximo: 20 } },
      },
    });
  }

  const pedidoExistente = await prisma.pedido.findFirst({
    where: { idCliente: cliente.id, estado: "pendiente" },
  });
  if (!pedidoExistente) {
    const carrito = await prisma.carrito.create({
      data: {
        idCliente: cliente.id,
        estado: "convertido",
        detalle: { create: [{ idProducto: producto.id, cantidad: 2 }] },
      },
    });
    await prisma.pedido.create({
      data: {
        idCarrito: carrito.id,
        idCliente: cliente.id,
        idTipoPago: pagoTarjeta.id,
        tipoEntrega: "RECOGER",
      },
    });
  }

  console.log("Seed completado:");
  console.log("  admin@tienda.com   / admin123   (rol ADMIN)");
  console.log("  cliente@tienda.com / cliente123 (rol CLIENTE, con perfil en CLIENTES)");
  console.log("  Pedido demo pendiente de pago con tarjeta (2 x Pastel de chocolate = $700)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
