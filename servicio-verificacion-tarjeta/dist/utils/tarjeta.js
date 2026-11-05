"use strict";
/**
 * Validaciones de tarjeta de crédito/débito (lógica pura, sin base de datos).
 *
 * IMPORTANTE (seguridad): ninguna función de este archivo guarda, imprime ni
 * devuelve el número completo de la tarjeta ni el CVV. Los mensajes de error
 * nunca incluyen datos de la tarjeta.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.limpiarNumero = limpiarNumero;
exports.validarLuhn = validarLuhn;
exports.detectarMarca = detectarMarca;
exports.longitudValida = longitudValida;
exports.validarExpiracion = validarExpiracion;
exports.validarCvv = validarCvv;
exports.mascararNumero = mascararNumero;
exports.verificarDatosTarjeta = verificarDatosTarjeta;
// Longitudes de número permitidas por marca
const LONGITUDES = {
    VISA: [16, 19],
    MASTERCARD: [16],
    AMEX: [15],
    DESCONOCIDA: [],
};
/** Quita espacios y guiones: "4242 4242-4242 4242" -> "4242424242424242" */
function limpiarNumero(entrada) {
    return typeof entrada === "string" ? entrada.replace(/[\s-]/g, "") : "";
}
/** Algoritmo de Luhn (checksum que usan todas las tarjetas bancarias). */
function validarLuhn(numero) {
    if (!/^\d{12,19}$/.test(numero))
        return false;
    let suma = 0;
    let duplicar = false;
    for (let i = numero.length - 1; i >= 0; i--) {
        let digito = Number(numero[i]);
        if (duplicar) {
            digito *= 2;
            if (digito > 9)
                digito -= 9;
        }
        suma += digito;
        duplicar = !duplicar;
    }
    return suma % 10 === 0;
}
/** Detecta la marca por el prefijo (BIN) del número. */
function detectarMarca(numero) {
    if (/^4/.test(numero))
        return "VISA";
    // Mastercard: 51-55 y la serie 2221-2720
    if (/^(5[1-5]\d{2}|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(numero)) {
        return "MASTERCARD";
    }
    if (/^3[47]/.test(numero))
        return "AMEX";
    return "DESCONOCIDA";
}
function longitudValida(numero, marca) {
    return LONGITUDES[marca].includes(numero.length);
}
/**
 * Valida mes/año de expiración. Acepta año de 2 o 4 dígitos (30 -> 2030).
 * Una tarjeta es válida hasta el ÚLTIMO día del mes de expiración.
 */
function validarExpiracion(mes, anio, ahora = new Date()) {
    const m = Number(mes);
    let a = Number(anio);
    if (!Number.isInteger(m) || m < 1 || m > 12 || !Number.isInteger(a) || a < 0) {
        return { valida: false, motivo: "formato" };
    }
    if (a < 100)
        a += 2000;
    if (a < 2000 || a > 2100)
        return { valida: false, motivo: "formato" };
    const anioActual = ahora.getFullYear();
    const mesActual = ahora.getMonth() + 1;
    if (a < anioActual || (a === anioActual && m < mesActual)) {
        return { valida: false, motivo: "vencida", mes: m, anio: a };
    }
    if (a > anioActual + 20) {
        return { valida: false, motivo: "lejana", mes: m, anio: a };
    }
    return { valida: true, mes: m, anio: a };
}
/** CVV: 3 dígitos (Visa/Mastercard) o 4 dígitos (American Express). */
function validarCvv(cvv, marca) {
    if (typeof cvv !== "string")
        return false;
    if (marca === "AMEX")
        return /^\d{4}$/.test(cvv);
    if (marca === "DESCONOCIDA")
        return /^\d{3,4}$/.test(cvv);
    return /^\d{3}$/.test(cvv);
}
/** Representación enmascarada que sí se puede mostrar: •••• •••• •••• 4242 */
function mascararNumero(marca, ultimosDigitos) {
    if (marca === "AMEX")
        return `•••• •••••• •${ultimosDigitos}`;
    return `•••• •••• •••• ${ultimosDigitos}`;
}
/**
 * Verificación completa de los datos de una tarjeta (sin consultar al banco).
 * Devuelve el detalle de cada comprobación para poder mostrarlo al usuario.
 */
function verificarDatosTarjeta(entrada, ahora = new Date()) {
    const errores = [];
    const numero = limpiarNumero(entrada?.numero);
    const formatoNumero = /^\d{12,19}$/.test(numero);
    if (!formatoNumero) {
        errores.push("El número de tarjeta debe contener solo dígitos (12 a 19).");
    }
    const luhn = formatoNumero && validarLuhn(numero);
    if (formatoNumero && !luhn) {
        errores.push("El número de tarjeta no es válido (falla la verificación Luhn).");
    }
    const marca = formatoNumero ? detectarMarca(numero) : "DESCONOCIDA";
    const marcaYLongitud = formatoNumero && marca !== "DESCONOCIDA" && longitudValida(numero, marca);
    if (formatoNumero && marca === "DESCONOCIDA") {
        errores.push("Marca no soportada: solo se aceptan Visa, Mastercard y American Express.");
    }
    else if (formatoNumero && !marcaYLongitud) {
        errores.push(`La longitud del número no corresponde a una tarjeta ${marca}.`);
    }
    const exp = validarExpiracion(entrada?.mes, entrada?.anio, ahora);
    if (!exp.valida) {
        errores.push(exp.motivo === "vencida"
            ? "La tarjeta está vencida."
            : exp.motivo === "lejana"
                ? "La fecha de expiración es demasiado lejana."
                : "El mes/año de expiración no tiene un formato válido.");
    }
    const cvvValido = validarCvv(entrada?.cvv, marca);
    if (!cvvValido) {
        errores.push(marca === "AMEX"
            ? "El CVV de American Express debe tener 4 dígitos."
            : "El CVV debe tener 3 dígitos.");
    }
    const resultado = {
        valida: formatoNumero && luhn && marcaYLongitud && exp.valida && cvvValido,
        marca,
        verificaciones: {
            formatoNumero,
            luhn,
            marcaYLongitud,
            expiracion: exp.valida,
            cvv: cvvValido,
        },
        errores,
    };
    if (formatoNumero) {
        const ultimos = numero.slice(-4);
        resultado.ultimosDigitos = ultimos;
        resultado.mascara = mascararNumero(marca, ultimos);
    }
    if (exp.mes !== undefined && exp.anio !== undefined) {
        resultado.mes = exp.mes;
        resultado.anio = exp.anio;
    }
    return resultado;
}
