
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const path = require('path');

const productoRoutes = require('./routes/producto.routes');
const stockRoutes = require('./routes/stock.routes');
const ofertasRoutes = require('./routes/ofertas.routes');
const contactoRoutes = require('./routes/contacto.routes');
const comprasRoutes = require('./routes/compra.routes');
const inventarioRoutes = require('./routes/inventario.routes');

const swaggerSpec = require('./config/swagger');

const {
    rutaNoEncontrada,
    manejarErrores
} = require('./middlewares/errorHandler');

const app = express();
const PORT = process.env.PORT || 3005;

// Middlewares generales
// CORS: orígenes del frontend configurables (CORS_ORIGINS separados por comas).
const origenesPermitidos = (process.env.CORS_ORIGINS ||
    'http://127.0.0.1:5500,http://localhost:5500')
    .split(',')
    .map(origen => origen.trim())
    .filter(Boolean);

app.use(cors({
    origin(origen, callback) {
        // Peticiones sin origen (otros microservicios, Postman) o permitidas.
        if (!origen || origenesPermitidos.includes(origen)) {
            return callback(null, true);
        }
        return callback(null, false);
    },
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Servicio-Clave']
}));
app.use(express.json({ limit: '1mb' }));

// Rutas de contacto
app.use('/api/contacto', contactoRoutes);

// Permitir consultar las imágenes de los productos
app.use(
    '/uploads',
    express.static(path.join(__dirname, '../uploads'))
);

// Documentación Swagger
app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec)
);

// Health check
app.get('/api/health', (req, res) => {
    return res.status(200).json({
        success: true,
        service: 'inventario-service',
        message: 'Servicio de inventario funcionando correctamente'
    });
});

// Rutas de productos
app.use('/api/productos', productoRoutes);

// Rutas de stock
app.use('/api/stock', stockRoutes);

// Rutas de ofertas
app.use('/api/ofertas', ofertasRoutes);

// Rutas de compras a proveedores
app.use('/api/compras', comprasRoutes);

// Inventario automático: disponibilidad, ventas, cancelaciones,
// devoluciones, entradas, ajustes, movimientos y alertas
app.use('/api/inventario', inventarioRoutes);

// Ruta no encontrada
app.use(rutaNoEncontrada);

// Manejador general de errores
app.use(manejarErrores);

// Iniciar servidor
app.listen(PORT, () => {
    console.log(
        `Servidor de inventario ejecutándose en http://localhost:${PORT}`
    );

    console.log(
        `Documentación disponible en http://localhost:${PORT}/api/docs`
    );

    console.log(
        `Compras disponibles en http://localhost:${PORT}/api/compras`
    );
});
