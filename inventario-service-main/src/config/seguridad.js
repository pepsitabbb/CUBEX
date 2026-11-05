/* =====================================================================
   CUBEX - SEGURIDAD COMPARTIDA (copia idéntica en cada microservicio Node)

   - Verifica los JWT emitidos por microservicio-login (HS256) usando el
     mismo JWT_SECRET y JWT_ISSUER, sin dependencias externas.
   - Verifica la clave interna entre servicios (cabecera X-Servicio-Clave)
     configurada en CUBEX_SERVICE_KEY.
   ===================================================================== */

const crypto = require('crypto');

const ROLES_PERSONAL = ['ADMIN', 'VENDEDOR'];

function leerVariable(nombre) {
    return String(process.env[nombre] || '').replace(/\r/g, '').trim();
}

function base64UrlADatos(texto) {
    const normalizado = String(texto).replace(/-/g, '+').replace(/_/g, '/');
    const relleno = normalizado.length % 4 === 0
        ? ''
        : '='.repeat(4 - (normalizado.length % 4));
    return Buffer.from(normalizado + relleno, 'base64');
}

function compararSeguro(a, b) {
    const bufferA = Buffer.from(String(a));
    const bufferB = Buffer.from(String(b));

    if (bufferA.length !== bufferB.length) {
        return false;
    }

    return crypto.timingSafeEqual(bufferA, bufferB);
}

class ErrorSeguridad extends Error {
    constructor(status, codigo, mensaje) {
        super(mensaje);
        this.status = status;
        this.codigo = codigo;
    }
}

// Verifica firma, algoritmo, expiración y emisor del token.
function verificarToken(token) {
    const secreto = leerVariable('JWT_SECRET');
    const emisor = leerVariable('JWT_ISSUER');

    if (!secreto) {
        throw new ErrorSeguridad(
            500,
            'CONFIGURACION',
            'El servicio no tiene configurado JWT_SECRET.'
        );
    }

    const partes = String(token || '').split('.');

    if (partes.length !== 3) {
        throw new ErrorSeguridad(401, 'TOKEN_INVALIDO', 'El token no es válido.');
    }

    let encabezado;
    let carga;

    try {
        encabezado = JSON.parse(base64UrlADatos(partes[0]).toString('utf8'));
        carga = JSON.parse(base64UrlADatos(partes[1]).toString('utf8'));
    } catch {
        throw new ErrorSeguridad(401, 'TOKEN_INVALIDO', 'El token no es válido.');
    }

    if (!encabezado || encabezado.alg !== 'HS256') {
        throw new ErrorSeguridad(401, 'TOKEN_INVALIDO', 'Algoritmo de token no permitido.');
    }

    const firmaEsperada = crypto
        .createHmac('sha256', secreto)
        .update(`${partes[0]}.${partes[1]}`)
        .digest('base64')
        .replace(/=+$/, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');

    if (!compararSeguro(firmaEsperada, partes[2])) {
        throw new ErrorSeguridad(401, 'TOKEN_INVALIDO', 'La firma del token no es válida.');
    }

    const ahora = Math.floor(Date.now() / 1000);

    if (typeof carga.exp === 'number' && ahora >= carga.exp) {
        throw new ErrorSeguridad(401, 'TOKEN_EXPIRADO', 'Tu sesión expiró. Inicia sesión nuevamente.');
    }

    if (typeof carga.nbf === 'number' && ahora < carga.nbf) {
        throw new ErrorSeguridad(401, 'TOKEN_INVALIDO', 'El token todavía no es válido.');
    }

    if (emisor && carga.iss !== emisor) {
        throw new ErrorSeguridad(401, 'TOKEN_INVALIDO', 'El emisor del token no es válido.');
    }

    const id = Number(carga.sub);
    const rol = String(carga.rol || '').trim().toUpperCase();

    if (!Number.isInteger(id) || id <= 0 || !rol) {
        throw new ErrorSeguridad(401, 'TOKEN_INVALIDO', 'El token no contiene un usuario válido.');
    }

    return {
        id,
        rol,
        nombreUsuario: carga.nombreUsuario || '',
        email: carga.email || null
    };
}

function extraerToken(req) {
    const cabecera = req.headers.authorization || '';
    const [esquema, valor] = cabecera.split(' ');

    if (esquema && esquema.toLowerCase() === 'bearer' && valor) {
        return valor.trim();
    }

    return null;
}

// Devuelve true si la petición viene de otro microservicio de CUBEX.
function esServicioInterno(req) {
    const clave = leerVariable('CUBEX_SERVICE_KEY');
    const recibida = String(req.headers['x-servicio-clave'] || '');

    if (clave.length < 16 || !recibida) {
        return false;
    }

    return compararSeguro(clave, recibida);
}

function responderError(res, error) {
    return res.status(error.status || 401).json({
        exitoso: false,
        success: false,
        codigo: error.codigo || 'NO_AUTORIZADO',
        mensaje: error.message,
        message: error.message
    });
}

// Exige un usuario autenticado (cualquier rol si no se indican roles).
function requiereUsuario(...roles) {
    return (req, res, next) => {
        const token = extraerToken(req);

        if (!token) {
            return responderError(res, new ErrorSeguridad(
                401,
                'SIN_TOKEN',
                'Debes iniciar sesión para realizar esta operación.'
            ));
        }

        try {
            req.usuario = verificarToken(token);
        } catch (error) {
            return responderError(res, error);
        }

        if (roles.length && !roles.includes(req.usuario.rol)) {
            return responderError(res, new ErrorSeguridad(
                403,
                'ACCESO_DENEGADO',
                'Tu cuenta no tiene permisos para esta operación.'
            ));
        }

        return next();
    };
}

// Permite un microservicio interno o un usuario con alguno de los roles.
function requiereServicioOUsuario(...roles) {
    const validarUsuario = requiereUsuario(...roles);

    return (req, res, next) => {
        if (esServicioInterno(req)) {
            req.servicioInterno = true;
            return next();
        }

        return validarUsuario(req, res, next);
    };
}

// Lee el usuario si envió token, pero no lo exige.
function usuarioOpcional(req, res, next) {
    const token = extraerToken(req);

    if (token) {
        try {
            req.usuario = verificarToken(token);
        } catch {
            req.usuario = null;
        }
    }

    return next();
}

function esPersonal(usuario) {
    return Boolean(usuario && ROLES_PERSONAL.includes(usuario.rol));
}

module.exports = {
    ROLES_PERSONAL,
    ErrorSeguridad,
    verificarToken,
    esServicioInterno,
    requiereUsuario,
    requiereServicioOUsuario,
    usuarioOpcional,
    esPersonal,
    leerVariable
};
