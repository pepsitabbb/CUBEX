
const jwt = require('jsonwebtoken');
const db = require('../db');

/**
 * Valida el token y consulta el usuario en la base de datos.
 */
async function autenticar(req, res, next) {
    try {
        const header = req.headers.authorization || '';
        const [tipo, token] = header.split(' ');

        if (tipo !== 'Bearer' || !token) {
            return res.status(401).json({
                error: 'Token requerido'
            });
        }

        let payload;

        try {
            payload = jwt.verify(token, process.env.JWT_SECRET, {
                issuer: process.env.JWT_ISSUER
            });
        } catch (error) {
            return res.status(401).json({
                error: 'Token inválido o expirado'
            });
        }

        const [rows] = await db.query(
            `SELECT
                u.id,
                u.nombre_usuario,
                u.email,
                u.estado,
                u.activo,
                r.nombre AS rol
             FROM usuarios u
             INNER JOIN roles r ON r.id = u.rol_id
             WHERE u.id = ?`,
            [payload.sub]
        );

        if (rows.length === 0) {
            return res.status(401).json({
                error: 'Usuario no existe'
            });
        }

        const usuario = rows[0];

        if (
            Number(usuario.activo) !== 1 ||
            usuario.estado === 'bloqueado'
        ) {
            return res.status(403).json({
                error: 'Usuario bloqueado o inactivo'
            });
        }

        req.usuario = {
            ...usuario,
            es_cliente: usuario.rol === 'CLIENTE'
        };

        next();

    } catch (error) {
        next(error);
    }
}

/**
 * Permite el acceso únicamente a los roles indicados.
 */
function requiereRol(...rolesPermitidos) {
    return (req, res, next) => {

        if (
            !req.usuario ||
            !rolesPermitidos.includes(req.usuario.rol)
        ) {
            return res.status(403).json({
                error: 'Acceso denegado',
                rol_actual: req.usuario?.rol,
                roles_requeridos: rolesPermitidos
            });
        }

        next();
    };
}

module.exports = {
    autenticar,
    requiereRol
};
