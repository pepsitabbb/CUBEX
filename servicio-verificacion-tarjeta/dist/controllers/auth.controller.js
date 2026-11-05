"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verificarRolEndpoint = verificarRolEndpoint;
function verificarRolEndpoint(req, res) {
    res.status(200).json({ autenticado: true, idUsuario: req.usuario?.idUsuario, nombreUsuario: req.usuario?.nombreUsuario, rol: req.usuario?.nombreRol });
}
