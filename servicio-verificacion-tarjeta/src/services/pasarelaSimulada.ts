import { randomBytes } from "crypto";

/**
 * PASARELA DE PAGOS SIMULADA
 * ---------------------------
 * Imita lo que haría un procesador real (Stripe, Conekta, Mercado Pago...)
 * para poder probar todo el flujo sin cobrar dinero ni contratar nada.
 *
 * En producción este archivo se REEMPLAZA por la integración real. Lo ideal
 * es que el número de tarjeta se capture con los campos seguros del propio
 * procesador (hosted fields / checkout) para que NUNCA pase por este servidor.
 *
 * Tarjetas de prueba (por los últimos 4 dígitos):
 *   ...0002  -> rechazada siempre (tarjeta_rechazada)
 *   ...9995  -> fondos insuficientes siempre
 *   ...0341  -> se registra bien, pero RECHAZA al momento de pagar
 *   cualquier otra -> aprobada
 */

export type ContextoAutorizacion = "verificacion" | "pago";

export interface RespuestaPasarela {
  aprobada: boolean;
  codigo: string;
  mensaje: string;
  codigoAutorizacion?: string;
}

/** Genera un token opaco. NO se deriva del número de tarjeta. */
export function tokenizarTarjeta(): string {
  return "tok_sim_" + randomBytes(16).toString("hex");
}

export function autorizarTarjeta(params: {
  marca: string;
  ultimosDigitos: string;
  monto?: number;
  contexto: ContextoAutorizacion;
}): RespuestaPasarela {
  const { ultimosDigitos, contexto } = params;

  if (ultimosDigitos === "0002") {
    return {
      aprobada: false,
      codigo: "tarjeta_rechazada",
      mensaje: "El banco emisor rechazó la tarjeta (simulado).",
    };
  }

  if (ultimosDigitos === "9995") {
    return {
      aprobada: false,
      codigo: "fondos_insuficientes",
      mensaje: "La tarjeta no tiene fondos suficientes (simulado).",
    };
  }

  if (ultimosDigitos === "0341" && contexto === "pago") {
    return {
      aprobada: false,
      codigo: "tarjeta_rechazada",
      mensaje: "El banco rechazó el cargo al momento del pago (simulado).",
    };
  }

  return {
    aprobada: true,
    codigo: "aprobada",
    mensaje:
      contexto === "verificacion"
        ? "Tarjeta verificada correctamente (simulado)."
        : "Pago autorizado (simulado).",
    codigoAutorizacion: "SIM-" + randomBytes(3).toString("hex").toUpperCase(),
  };
}
