import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { verificarDatosTarjeta, mascararNumero, validarExpiracion } from "../utils/tarjeta";
import { autorizarTarjeta, tokenizarTarjeta } from "../services/pasarelaSimulada";
import { registrarFallo } from "../utils/limiteIntentos";
import { obtenerClienteDeUsuario } from "../utils/cliente";
import { crearTokenTarjeta, leerTokenTarjeta } from "../utils/tokenTarjeta";

function presentar(t: { id:number; token_pago:string; ultimos_digitos:string|null; verificada:boolean|null }) {
  const meta = leerTokenTarjeta(t.token_pago);
  const marca = meta?.marca || "TARJETA";
  const mes = meta?.mes ?? null;
  const anio = meta?.anio ?? null;
  const exp = meta ? validarExpiracion(meta.mes,meta.anio) : {valida:false};
  return { id:t.id, marca, ultimosDigitos:t.ultimos_digitos || "", mascara:mascararNumero(marca,t.ultimos_digitos || "****"), mesExpiracion:mes, anioExpiracion:anio, verificada:Boolean(t.verificada), vencida:!exp.valida };
}

export async function verificarTarjeta(req:Request,res:Response):Promise<void> {
  const r=verificarDatosTarjeta(req.body || {});
  if (!r.valida) registrarFallo(req.usuario!.idUsuario);
  res.status(200).json(r);
}

export async function registrarTarjeta(req:Request,res:Response):Promise<void> {
  const idUsuario=req.usuario!.idUsuario;
  const cliente=await obtenerClienteDeUsuario(idUsuario);
  if (!cliente) { res.status(403).json({error:"El usuario no tiene perfil de cliente"}); return; }
  const v=verificarDatosTarjeta(req.body || {});
  if (!v.valida || !v.mes || !v.anio || !v.ultimosDigitos) {
    registrarFallo(idUsuario); res.status(422).json({error:"Tarjeta inválida",...v}); return;
  }
  const marca=v.marca;
  const duplicada=await prisma.tarjetas.findFirst({where:{id_cliente:cliente.id,ultimos_digitos:v.ultimosDigitos}});
  if (duplicada) { res.status(409).json({error:"Ya existe una tarjeta registrada con esos últimos cuatro dígitos",idTarjeta:duplicada.id}); return; }
  const respuesta=autorizarTarjeta({marca,ultimosDigitos:v.ultimosDigitos,contexto:"verificacion"});
  if (!respuesta.aprobada) { registrarFallo(idUsuario); res.status(402).json({error:respuesta.mensaje,codigo:respuesta.codigo}); return; }
  const token_pago=crearTokenTarjeta({v:1,marca,mes:v.mes,anio:v.anio});
  const tarjeta=await prisma.tarjetas.create({data:{id_cliente:cliente.id,token_pago,ultimos_digitos:v.ultimosDigitos,verificada:true}});
  res.status(201).json({mensaje:"Tarjeta verificada y registrada",codigoAutorizacion:respuesta.codigoAutorizacion,tarjeta:presentar(tarjeta)});
}

export async function listarTarjetas(req:Request,res:Response):Promise<void> {
  const cliente=await obtenerClienteDeUsuario(req.usuario!.idUsuario);
  if (!cliente) { res.status(403).json({error:"El usuario no tiene perfil de cliente"}); return; }
  const tarjetas=await prisma.tarjetas.findMany({where:{id_cliente:cliente.id},orderBy:{id:"desc"}});
  res.status(200).json({tarjetas:tarjetas.map(presentar)});
}

export async function eliminarTarjeta(req:Request,res:Response):Promise<void> {
  const id=Number(req.params.id);
  if (!Number.isInteger(id)||id<=0) {res.status(400).json({error:"Id de tarjeta inválido"});return;}
  const cliente=await obtenerClienteDeUsuario(req.usuario!.idUsuario);
  if (!cliente) {res.status(403).json({error:"El usuario no tiene perfil de cliente"});return;}
  const tarjeta=await prisma.tarjetas.findFirst({where:{id,id_cliente:cliente.id}});
  if (!tarjeta) {res.status(404).json({error:"Tarjeta no encontrada"});return;}
  try { await prisma.tarjetas.delete({where:{id}}); res.json({mensaje:"Tarjeta eliminada"}); }
  catch(e) { if ((e as {code?:string}).code==="P2003") {res.status(409).json({error:"No se puede eliminar: la tarjeta está ligada a un pedido"});return;} throw e; }
}
