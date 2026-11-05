"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificarAutenticacion = verificarAutenticacion;
const jwt_1 = require("../utils/jwt");
function verificarAutenticacion(req, res, next) {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Token no proporcionado" });
        return;
    }
    try {
        const payload = (0, jwt_1.verificarToken)(header.slice(7));
        const idUsuario = Number(payload.sub);
        const nombreRol = String(payload.rol || "").trim().toUpperCase();
        if (!Number.isInteger(idUsuario) || idUsuario <= 0 || !nombreRol) {
            res.status(401).json({ error: "El token no contiene sub y rol válidos" });
            return;
        }
        req.usuario = {
            idUsuario,
            nombreUsuario: payload.nombreUsuario || "",
            correo: payload.email || "",
            nombreRol,
        };
        next();
    }
    catch {
        res.status(401).json({ error: "Token inválido o expirado" });
    }
}
