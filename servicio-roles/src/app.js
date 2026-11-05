
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();

// CONFIGURACIÓN CORS
app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Recibir datos JSON
app.use(express.json());

// Comprobar que el servicio funciona
app.get('/health', (req, res) => {
    res.json({
        servicio: 'roles',
        ok: true
    });
});

// Rutas del servicio
app.use('/auth', require('./routes/auth'));
app.use('/roles', require('./routes/roles'));
app.use('/usuarios', require('./routes/usuarios'));

// Ruta no encontrada
app.use((req, res) => {
    res.status(404).json({
        error: 'Ruta no encontrada'
    });
});

// Manejo de errores
app.use((err, req, res, next) => {
    console.error(err);

    res.status(500).json({
        error: 'Error interno del servidor'
    });
});

// Puerto del servicio
const PORT = Number(process.env.PORT || 3000);

app.listen(PORT, () => {
    console.log(`Servicio de roles funcionando en http://localhost:${PORT}`);
});
