
import express from 'express';
import { filtros, entero, errorHttp } from './validacion.js';
import cors from 'cors';

export function crearApp(repositorio) {
    const app = express();

    // Configuración general
    app.disable('x-powered-by');
    app.set('query parser', 'simple');

    // Permitir peticiones desde el frontend de CUBEX
    app.use(cors({
        origin: [
            'http://127.0.0.1:5500',
            'http://localhost:5500'
        ],
        methods: ['GET', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Accept']
    }));

    // Evitar que el navegador almacene respuestas
    app.use((req, res, next) => {
        res.set('Cache-Control', 'no-store');
        next();
    });

    // =====================================
    // COMPROBAR CONEXIÓN
    // =====================================
    app.get('/api/v1/salud', async (req, res) => {
        try {
            await repositorio.salud();

            res.json({
                ok: true,
                servicio: 'reporte-compras',
                baseDatos: 'conectada'
            });
        } catch {
            res.status(503).json({
                ok: false,
                mensaje: 'Base de datos no disponible.'
            });
        }
    });

    // =====================================
    // LISTAR COMPRAS
    // =====================================
    app.get('/api/v1/reportes/compras', async (req, res) => {
        const filtro = filtros(req.query, true);

        const resultado = await repositorio.listar(filtro);

        res.json({
            ok: true,
            moneda: 'MXN',
            filtros: filtro,
            ...resultado
        });
    });

    // =====================================
    // RESUMEN DE COMPRAS
    // =====================================
    app.get('/api/v1/reportes/compras/resumen', async (req, res) => {
        const filtro = filtros(req.query);

        res.json({
            ok: true,
            moneda: 'MXN',
            filtros: filtro,
            datos: await repositorio.resumen(filtro)
        });
    });

    // =====================================
    // DETALLE DE UNA COMPRA
    // =====================================
    app.get('/api/v1/reportes/compras/:id', async (req, res) => {
        if (Object.keys(req.query).length) {
            throw errorHttp(400, 'El detalle no acepta filtros.');
        }

        const datos = await repositorio.detalle(
            entero(req.params.id, 'id')
        );

        if (!datos) {
            throw errorHttp(404, 'Compra no encontrada.');
        }

        res.json({
            ok: true,
            datos
        });
    });

    // =====================================
    // RUTA NO ENCONTRADA
    // =====================================
    app.use((req, res) => {
        res.status(404).json({
            ok: false,
            mensaje: 'Ruta no encontrada.'
        });
    });

    // =====================================
    // MANEJO DE ERRORES
    // =====================================
    app.use((error, req, res, next) => {
        const status =
            error.status === 400 || error.status === 404
                ? error.status
                : 500;

        if (status === 500) {
            console.error(
                'Error del servicio:',
                error.code || error.name
            );
        }

        res.status(status).json({
            ok: false,
            mensaje: status === 500
                ? 'Error interno al consultar el reporte.'
                : error.message
        });
    });

    return app;
}
