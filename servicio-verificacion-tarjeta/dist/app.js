"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const auth_routes_1 = __importDefault(require("./routes/auth.routes"));
const tarjeta_routes_1 = __importDefault(require("./routes/tarjeta.routes"));
const pago_routes_1 = __importDefault(require("./routes/pago.routes"));
exports.app = (0, express_1.default)();
exports.app.use((0, cors_1.default)({
    origin: ["http://127.0.0.1:5500", "http://localhost:5500", "https://cubex-tienda.netlify.app"],
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
exports.app.use(express_1.default.json({ limit: "20kb" }));
exports.app.get("/health", (_req, res) => res.json({ servicio: "verificacion-tarjetas", ok: true }));
exports.app.use("/auth", auth_routes_1.default);
exports.app.use("/tarjetas", tarjeta_routes_1.default);
exports.app.use("/pagos", pago_routes_1.default);
exports.app.use((_req, res) => res.status(404).json({ error: "Ruta no encontrada" }));
exports.app.use((err, _req, res, _next) => {
    console.error("Error del servicio:", err instanceof Error ? err.message : "desconocido");
    res.status(500).json({ error: "Error interno del servicio de tarjetas" });
});
