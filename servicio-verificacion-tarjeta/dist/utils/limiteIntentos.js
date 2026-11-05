"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registrarFallo = registrarFallo;
exports.estadoBloqueo = estadoBloqueo;
const fallos = new Map();
function vigentes(id) {
    const ventana = (Number(process.env.VENTANA_INTENTOS_MIN) || 10) * 60000;
    const lista = (fallos.get(id) || []).filter(t => t > Date.now() - ventana);
    fallos.set(id, lista);
    return lista;
}
function registrarFallo(id) { const l = vigentes(id); l.push(Date.now()); fallos.set(id, l); }
function estadoBloqueo(id) {
    const max = Number(process.env.MAX_INTENTOS_TARJETA) || 10;
    const ventana = (Number(process.env.VENTANA_INTENTOS_MIN) || 10) * 60000;
    const l = vigentes(id);
    if (l.length < max)
        return { bloqueado: false, reintentarEnSeg: 0 };
    return { bloqueado: true, reintentarEnSeg: Math.max(1, Math.ceil((l[0] + ventana - Date.now()) / 1000)) };
}
