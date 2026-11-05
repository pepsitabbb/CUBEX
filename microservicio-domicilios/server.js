import express from "express";
import cors from "cors";
import "dotenv/config";

import db from "./config/db.js";
import domicilioRoutes from "./routes/domicilioRoutes.js";

const app = express();

app.use(cors({
    origin: [
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://cubex-tienda.netlify.app"
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

// Ruta principal
app.get("/", (req, res) => {
    res.json({
        mensaje: "Microservicio de domicilios CUBEX funcionando."
    });
});

// Rutas de domicilios
app.use("/api/domicilios", domicilioRoutes);

// Ruta para verificar la conexión con MySQL
app.get("/api/health", async (req, res) => {
    try {
        const conexion = await db.getConnection();
        conexion.release();

        res.json({
            estado: "OK",
            baseDatos: "tienda_sb",
            conexion: "Conectada"
        });
    } catch (error) {
        console.error("Error de conexión:", error);

        res.status(500).json({
            estado: "ERROR",
            conexion: "No se pudo conectar a MySQL"
        });
    }
});

const PORT = process.env.PORT || 3019;

app.listen(PORT, () => {
    console.log(`Microservicio de domicilios ejecutándose en http://localhost:${PORT}`);
});