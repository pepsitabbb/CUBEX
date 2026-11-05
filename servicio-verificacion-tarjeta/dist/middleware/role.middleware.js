"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificarRol = verificarRol;
function verificarRol(...rolesPermitidos) {
    const permitidos = rolesPermitidos.map(r => r.toUpperCase());
    return (req, res, next) => {
        if (!req.usuario) {
            res.status(401).json({ error: "Usuario no autenticado" });
            return;
        }
        if (!permitidos.includes(req.usuario.nombreRol)) {
            res.status(403).json({ error: "No tienes permisos", rolActual: req.usuario.nombreRol, rolesPermitidos: permitidos });
            return;
        }
        next();
    };
}
