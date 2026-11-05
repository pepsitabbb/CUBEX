import { Request, Response } from "express";
export function verificarRolEndpoint(req:Request,res:Response):void {
  res.status(200).json({autenticado:true,idUsuario:req.usuario?.idUsuario,nombreUsuario:req.usuario?.nombreUsuario,rol:req.usuario?.nombreRol});
}
