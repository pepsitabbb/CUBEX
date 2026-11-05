import { Request, Response, NextFunction } from "express";
import { estadoBloqueo } from "../utils/limiteIntentos";
export function limitarIntentosTarjeta(req: Request, res: Response, next: NextFunction): void {
  if (!req.usuario) { res.status(401).json({ error: "Usuario no autenticado" }); return; }
  const estado = estadoBloqueo(req.usuario.idUsuario);
  if (estado.bloqueado) {
    res.setHeader("Retry-After", String(estado.reintentarEnSeg));
    res.status(429).json({ error: "Demasiados intentos fallidos", reintentarEnSegundos: estado.reintentarEnSeg }); return;
  }
  next();
}
