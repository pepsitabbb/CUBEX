const jwt = require('jsonwebtoken');

function extraerToken(cabecera) {
    if (!cabecera) return null;

    const [tipo, token] = cabecera.split(' ');

    if (tipo !== 'Bearer' || !token) return null;

    return token;
}

function requiereAutenticacion(req, res, next) {
    const token = extraerToken(req.headers.authorization);

    if (!token) {
        return res.status(401).json({
            mensaje: 'No se proporcionó un token de autenticación'
        });
    }

    try {
        req.usuario = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: process.env.JWT_ISSUER
        });

        next();
    } catch (error) {
    console.error('Error al verificar JWT:', error.name, error.message);

    return res.status(401).json({
        mensaje: 'Token inválido o expirado'
    });
}
}

function requiereRol(...rolesPermitidos) {
    return (req, res, next) => {
        if (!req.usuario) {
            return res.status(401).json({
                mensaje: 'No autenticado'
            });
        }

        if (!rolesPermitidos.includes(req.usuario.rol)) {
            return res.status(403).json({
                mensaje: 'No tienes permisos para realizar esta acción'
            });
        }

        next();
    };
}

module.exports = {
    requiereAutenticacion,
    requiereRol
};