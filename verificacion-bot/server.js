
const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const cors = require('cors');

const app = express();

// Configuración de CORS
app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ]
}));

// Permitir recibir JSON
app.use(express.json());

// Clave secreta
const SECRET = process.env.HUMAN_CHECK_SECRET || 'clave-secreta-cambiala';

// Limitar solicitudes
const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: {
        verificado: false,
        mensaje: 'Demasiadas solicitudes, intenta más tarde'
    }
});

app.use('/api/verify', limiter);

// Firmar el token
function firmar(payload) {
    const hmac = crypto
        .createHmac('sha256', SECRET)
        .update(payload)
        .digest('hex');

    return Buffer.from(`${payload}.${hmac}`).toString('base64');
}

// Verificar la firma
function verificarFirma(token) {
    try {
        const decoded = Buffer.from(token, 'base64').toString('utf8');
        const [payload, hmac] = decoded.split('.');

        if (!payload || !hmac) return null;

        const hmacEsperado = crypto
            .createHmac('sha256', SECRET)
            .update(payload)
            .digest('hex');

        if (hmac !== hmacEsperado) return null;

        return payload;

    } catch {
        return null;
    }
}

// 1. Generar token de seguridad
app.get('/api/verify/challenge', (req, res) => {
    const timestamp = Date.now();
    const payload = `${timestamp}-${req.ip}`;
    const token = firmar(payload);

    res.json({ token });
});

// 2. Verificar usuario
app.post('/api/verify/check', (req, res) => {
    const { token, honeypot } = req.body;

    // Detectar campo trampa
    if (honeypot && honeypot.trim() !== '') {
        return res.status(400).json({
            verificado: false,
            mensaje: 'Actividad sospechosa detectada'
        });
    }

    // Validar token
    const payload = verificarFirma(token);

    if (!payload) {
        return res.status(400).json({
            verificado: false,
            mensaje: 'Token inválido o alterado'
        });
    }

    const [timestampStr, ip] = payload.split('-');
    const timestamp = parseInt(timestampStr, 10);

    // Validar IP
    if (ip !== req.ip) {
        return res.status(400).json({
            verificado: false,
            mensaje: 'La IP no coincide con la solicitud original'
        });
    }

    const transcurrido = Date.now() - timestamp;

    // Validar tiempo mínimo
    if (transcurrido < 1500) {
        return res.status(400).json({
            verificado: false,
            mensaje: 'Envío demasiado rápido, posible bot'
        });
    }

    // Validar expiración
    if (transcurrido > 5 * 60 * 1000) {
        return res.status(400).json({
            verificado: false,
            mensaje: 'La verificación expiró, recarga la página'
        });
    }

    // Validar User-Agent
    const ua = req.headers['user-agent'] || '';

    if (!ua || /bot|crawler|curl|python-requests|wget|scrapy/i.test(ua)) {
        return res.status(400).json({
            verificado: false,
            mensaje: 'User-Agent sospechoso'
        });
    }

    // Verificación exitosa
    res.json({
        verificado: true,
        mensaje: 'Usuario verificado correctamente'
    });
});

// Puerto del microservicio
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log(`API de verificación corriendo en http://localhost:${PORT}`);
});
