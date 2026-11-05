/**
 * Pruebas automáticas del validador de tarjetas (no requiere base de datos).
 * Ejecutar con:  npm run test:tarjeta
 */
import assert from "node:assert/strict";
import {
  verificarDatosTarjeta,
  validarLuhn,
  detectarMarca,
  validarExpiracion,
  limpiarNumero,
} from "../src/utils/tarjeta";

let total = 0;
function caso(nombre: string, fn: () => void) {
  total++;
  try {
    fn();
    console.log(`  OK   ${nombre}`);
  } catch (e) {
    console.error(`  FALLA ${nombre}\n       ${(e as Error).message}`);
    process.exitCode = 1;
  }
}

// Fecha fija para que las pruebas no dependan del día en que se corran
const AHORA = new Date("2026-10-22T12:00:00");

console.log("Luhn");
caso("Visa de prueba es válida", () => assert.equal(validarLuhn("4242424242424242"), true));
caso("Un dígito cambiado falla", () => assert.equal(validarLuhn("4242424242424241"), false));
caso("Texto no numérico falla", () => assert.equal(validarLuhn("abcd"), false));

console.log("Marca");
caso("Visa", () => assert.equal(detectarMarca("4242424242424242"), "VISA"));
caso("Mastercard 5xxx", () => assert.equal(detectarMarca("5555555555554444"), "MASTERCARD"));
caso("Mastercard serie 2", () => assert.equal(detectarMarca("2223003122003222"), "MASTERCARD"));
caso("Amex", () => assert.equal(detectarMarca("378282246310005"), "AMEX"));
caso("Desconocida", () => assert.equal(detectarMarca("9111111111111111"), "DESCONOCIDA"));

console.log("Expiración");
caso("Mes actual sigue vigente", () => assert.equal(validarExpiracion(10, 2026, AHORA).valida, true));
caso("Mes anterior está vencida", () => {
  const r = validarExpiracion(9, 2026, AHORA);
  assert.equal(r.valida, false);
  assert.equal(r.motivo, "vencida");
});
caso("Año de 2 dígitos se normaliza", () => assert.equal(validarExpiracion("12", "30", AHORA).anio, 2030));
caso("Mes 13 es formato inválido", () => assert.equal(validarExpiracion(13, 2030, AHORA).motivo, "formato"));
caso("Demasiado lejana", () => assert.equal(validarExpiracion(1, 2060, AHORA).motivo, "lejana"));

console.log("Verificación completa");
caso("Visa válida con espacios", () => {
  const r = verificarDatosTarjeta({ numero: "4242 4242 4242 4242", mes: 12, anio: 2030, cvv: "123" }, AHORA);
  assert.equal(r.valida, true);
  assert.equal(r.marca, "VISA");
  assert.equal(r.ultimosDigitos, "4242");
  assert.equal(r.mascara, "•••• •••• •••• 4242");
});
caso("Amex válida exige CVV de 4 dígitos", () => {
  const ok = verificarDatosTarjeta({ numero: "378282246310005", mes: 12, anio: 2030, cvv: "1234" }, AHORA);
  const mal = verificarDatosTarjeta({ numero: "378282246310005", mes: 12, anio: 2030, cvv: "123" }, AHORA);
  assert.equal(ok.valida, true);
  assert.equal(mal.valida, false);
  assert.equal(mal.verificaciones.cvv, false);
});
caso("Luhn inválido se reporta", () => {
  const r = verificarDatosTarjeta({ numero: "4242424242424241", mes: 12, anio: 2030, cvv: "123" }, AHORA);
  assert.equal(r.valida, false);
  assert.equal(r.verificaciones.luhn, false);
});
caso("Tarjeta vencida se reporta", () => {
  const r = verificarDatosTarjeta({ numero: "4242424242424242", mes: 1, anio: 2020, cvv: "123" }, AHORA);
  assert.equal(r.valida, false);
  assert.equal(r.verificaciones.expiracion, false);
});
caso("Marca no soportada", () => {
  const r = verificarDatosTarjeta({ numero: "6011111111111117", mes: 12, anio: 2030, cvv: "123" }, AHORA);
  assert.equal(r.valida, false);
  assert.equal(r.verificaciones.marcaYLongitud, false);
});
caso("Entrada vacía no truena", () => {
  const r = verificarDatosTarjeta({}, AHORA);
  assert.equal(r.valida, false);
  assert.ok(r.errores.length >= 3);
});
caso("Los errores nunca incluyen el número", () => {
  const num = "4242424242424241";
  const r = verificarDatosTarjeta({ numero: num, mes: 12, anio: 2030, cvv: "123" }, AHORA);
  assert.equal(JSON.stringify(r).includes(num), false);
});
caso("limpiarNumero quita guiones y espacios", () =>
  assert.equal(limpiarNumero("4242-4242 4242-4242"), "4242424242424242"));

console.log(`\n${total} pruebas ejecutadas${process.exitCode ? " — HAY FALLAS" : " — todas pasaron"}`);
