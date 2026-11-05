
import jwt from "jsonwebtoken";
import "dotenv/config";

export function requiereAutenticacion(req, res, next) {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({
            exito: false,
            mensaje: "Debes iniciar sesión para continuar."
        });
    }

    const token = authorization.substring(7).trim();

    if (!token) {
        return res.status(401).json({
            exito: false,
            mensaje: "Token no proporcionado."
        });
    }

    try {
        const usuario = jwt.verify(
            token,
            process.env.JWT_SECRET,
            {
                issuer: process.env.JWT_ISSUER
            }
        );

        if (!usuario.sub || !/^\d+$/.test(usuario.sub)) {
            return res.status(401).json({
                exito: false,
                mensaje: "El token no contiene un identificador válido."
            });
        }

        req.usuario = usuario;
        next();

    } catch (error) {
        return res.status(401).json({
            exito: false,
            mensaje: error.name === "TokenExpiredError"
                ? "Tu sesión ha expirado. Inicia sesión nuevamente."
                : "El token no es válido."
        });
    }
}
