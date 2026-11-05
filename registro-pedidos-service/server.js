
require('dotenv').config();

const express = require('express');
const cors = require('cors');

const app = express();
const pool = require('./config/database');
const pedidosRoutes = require('./routes/pedidos.routes');

// Configuración
app.use(cors({
    origin: (process.env.CORS_ORIGINS || 'http://127.0.0.1:5500,http://localhost:5500')
        .split(',')
        .map(origen => origen.trim())
        .filter(Boolean)
}));

app.use(express.json({ limit: '200kb' }));

// Rutas de pedidos
app.use('/api/Pedidos', pedidosRoutes);

// Verificar funcionamiento
app.get('/api/salud', (req, res) => {
    res.json({
        exitoso: true,
        mensaje: 'Microservicio de pedidos CUBEX funcionando'
    });
});

// Verificar conexión con MySQL
app.get('/api/conexion', async (req, res) => {
    try {
        const [resultado] = await pool.query(
            'SELECT DATABASE() AS base'
        );

        res.json({
            exitoso: true,
            mensaje: 'Conexión a MySQL correcta',
            base: resultado[0].base
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            exitoso: false,
            mensaje: 'Error al conectar con MySQL'
        });
    }
});

// Ruta no encontrada
app.use((req, res) => {
    res.status(404).json({ exitoso: false, mensaje: 'Ruta no encontrada' });
});

// Errores generales (JSON mal formado, etc.)
app.use((error, req, res, next) => {
    if (error && error.type === 'entity.parse.failed') {
        return res.status(400).json({ exitoso: false, mensaje: 'JSON inválido o mal formado' });
    }

    console.error('Error no controlado:', error);
    return res.status(500).json({ exitoso: false, mensaje: 'Error interno del servicio de pedidos' });
});

// Iniciar servidor
const PORT = process.env.PORT || 3011;

app.listen(PORT, () => {
    console.log(`🚀 Pedidos CUBEX ejecutándose en http://localhost:${PORT}`);
});
