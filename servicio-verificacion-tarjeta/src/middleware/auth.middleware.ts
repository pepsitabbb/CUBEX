import { Request, Response, NextFunction } from "express";
import { verificarToken } from "../utils/jwt";

export function verificarAutenticacion(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Token no proporcionado" }); return;
  }
  try {
    const payload = verificarToken(header.slice(7));
    const idUsuario = Number(payload.sub);
    const nombreRol = String(payload.rol || "").trim().toUpperCase();
    if (!Number.isInteger(idUsuario) || idUsuario <= 0 || !nombreRol) {
      res.status(401).json({ error: "El token no contiene sub y rol válidos" }); return;
    }
    req.usuario = {
      idUsuario,
      nombreUsuario: payload.nombreUsuario || "",
      correo: payload.email || "",
      nombreRol,
    };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}
