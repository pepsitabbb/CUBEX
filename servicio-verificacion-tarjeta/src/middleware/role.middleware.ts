import { Request, Response, NextFunction } from "express";
export function verificarRol(...rolesPermitidos: string[]) {
  const permitidos = rolesPermitidos.map(r => r.toUpperCase());
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.usuario) { res.status(401).json({ error: "Usuario no autenticado" }); return; }
    if (!permitidos.includes(req.usuario.nombreRol)) {
      res.status(403).json({ error: "No tienes permisos", rolActual: req.usuario.nombreRol, rolesPermitidos: permitidos }); return;
    }
    next();
  };
}
