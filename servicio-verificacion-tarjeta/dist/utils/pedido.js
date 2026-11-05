"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcularMonto = calcularMonto;
function calcularMonto(detalle) {
    return Math.round(detalle.reduce((s, l) => s + Number(l.productos.precio.toString()) * l.cantidad, 0) * 100) / 100;
}
