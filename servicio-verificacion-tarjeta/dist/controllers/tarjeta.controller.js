"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificarTarjeta = verificarTarjeta;
exports.registrarTarjeta = registrarTarjeta;
exports.listarTarjetas = listarTarjetas;
exports.eliminarTarjeta = eliminarTarjeta;
const prisma_1 = require("../config/prisma");
const tarjeta_1 = require("../utils/tarjeta");
const pasarelaSimulada_1 = require("../services/pasarelaSimulada");
const limiteIntentos_1 = require("../utils/limiteIntentos");
const cliente_1 = require("../utils/cliente");
const tokenTarjeta_1 = require("../utils/tokenTarjeta");
function presentar(t) {
    const meta = (0, tokenTarjeta_1.leerTokenTarjeta)(t.token_pago);
    const marca = meta?.marca || "TARJETA";
    const mes = meta?.mes ?? null;
    const anio = meta?.anio ?? null;
    const exp = meta ? (0, tarjeta_1.validarExpiracion)(meta.mes, meta.anio) : { valida: false };
    return { id: t.id, marca, ultimosDigitos: t.ultimos_digitos || "", mascara: (0, tarjeta_1.mascararNumero)(marca, t.ultimos_digitos || "****"), mesExpiracion: mes, anioExpiracion: anio, verificada: Boolean(t.verificada), vencida: !exp.valida };
}
async function verificarTarjeta(req, res) {
    const r = (0, tarjeta_1.verificarDatosTarjeta)(req.body || {});
    if (!r.valida)
        (0, limiteIntentos_1.registrarFallo)(req.usuario.idUsuario);
    res.status(200).json(r);
}
async function registrarTarjeta(req, res) {
    const idUsuario = req.usuario.idUsuario;
    const cliente = await (0, cliente_1.obtenerClienteDeUsuario)(idUsuario);
    if (!cliente) {
        res.status(403).json({ error: "El usuario no tiene perfil de cliente" });
        return;
    }
    const v = (0, tarjeta_1.verificarDatosTarjeta)(req.body || {});
    if (!v.valida || !v.mes || !v.anio || !v.ultimosDigitos) {
        (0, limiteIntentos_1.registrarFallo)(idUsuario);
        res.status(422).json({ error: "Tarjeta inválida", ...v });
        return;
    }
    const marca = v.marca;
    const duplicada = await prisma_1.prisma.tarjetas.findFirst({ where: { id_cliente: cliente.id, ultimos_digitos: v.ultimosDigitos } });
    if (duplicada) {
        res.status(409).json({ error: "Ya existe una tarjeta registrada con esos últimos cuatro dígitos", idTarjeta: duplicada.id });
        return;
    }
    const respuesta = (0, pasarelaSimulada_1.autorizarTarjeta)({ marca, ultimosDigitos: v.ultimosDigitos, contexto: "verificacion" });
    if (!respuesta.aprobada) {
        (0, limiteIntentos_1.registrarFallo)(idUsuario);
        res.status(402).json({ error: respuesta.mensaje, codigo: respuesta.codigo });
        return;
    }
    const token_pago = (0, tokenTarjeta_1.crearTokenTarjeta)({ v: 1, marca, mes: v.mes, anio: v.anio });
    const tarjeta = await prisma_1.prisma.tarjetas.create({ data: { id_cliente: cliente.id, token_pago, ultimos_digitos: v.ultimosDigitos, verificada: true } });
    res.status(201).json({ mensaje: "Tarjeta verificada y registrada", codigoAutorizacion: respuesta.codigoAutorizacion, tarjeta: presentar(tarjeta) });
}
async function listarTarjetas(req, res) {
    const cliente = await (0, cliente_1.obtenerClienteDeUsuario)(req.usuario.idUsuario);
    if (!cliente) {
        res.status(403).json({ error: "El usuario no tiene perfil de cliente" });
        return;
    }
    const tarjetas = await prisma_1.prisma.tarjetas.findMany({ where: { id_cliente: cliente.id }, orderBy: { id: "desc" } });
    res.status(200).json({ tarjetas: tarjetas.map(presentar) });
}
async function eliminarTarjeta(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        res.status(400).json({ error: "Id de tarjeta inválido" });
        return;
    }
    const cliente = await (0, cliente_1.obtenerClienteDeUsuario)(req.usuario.idUsuario);
    if (!cliente) {
        res.status(403).json({ error: "El usuario no tiene perfil de cliente" });
        return;
    }
    const tarjeta = await prisma_1.prisma.tarjetas.findFirst({ where: { id, id_cliente: cliente.id } });
    if (!tarjeta) {
        res.status(404).json({ error: "Tarjeta no encontrada" });
        return;
    }
    try {
        await prisma_1.prisma.tarjetas.delete({ where: { id } });
        res.json({ mensaje: "Tarjeta eliminada" });
    }
    catch (e) {
        if (e.code === "P2003") {
            res.status(409).json({ error: "No se puede eliminar: la tarjeta está ligada a un pedido" });
            return;
        }
        throw e;
    }
}
