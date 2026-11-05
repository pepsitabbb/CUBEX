# Servicio de Verificación de Tarjeta (servicio 19)

> **Versión independiente.** Este paquete (`servicio-verificacion-tarjeta`) contiene solo
> este servicio, con lo mínimo de acceso que necesita (login, JWT y `verificarRol`) y las
> 12 tablas de BD02 que usa. El código es el mismo que el del proyecto completo.

Módulo **Ventas – Carrito** de la repostería. Verifica las tarjetas de
crédito/débito en dos momentos: cuando el cliente **registra** una tarjeta y
cuando **paga** un pedido. Sigue el mismo patrón que la Verificación de Rol:
rutas protegidas por `verificarAutenticacion` + `verificarRol("CLIENTE")`,
controladores delgados y lógica reutilizable en `utils/`.

> **Alcance.** La pasarela de pagos es **simulada** (`services/pasarelaSimulada.ts`).
> Todo lo demás (validación, base de datos, seguridad, flujo con pedidos) es
> real y queda listo para cambiar la pasarela por Stripe, Conekta o
> Mercado Pago sin tocar los controladores.

---

## 1. Qué verifica

| # | Comprobación | Dónde |
|---|---|---|
| 1 | Número con solo dígitos (12–19) | `utils/tarjeta.ts` |
| 2 | Algoritmo de **Luhn** (checksum de las tarjetas bancarias) | `utils/tarjeta.ts` |
| 3 | **Marca** por prefijo: Visa, Mastercard, American Express | `utils/tarjeta.ts` |
| 4 | Longitud correcta para la marca (Amex 15, Visa 16/19, MC 16) | `utils/tarjeta.ts` |
| 5 | **Vencimiento** vigente (válida hasta el último día del mes) | `utils/tarjeta.ts` |
| 6 | **CVV**: 3 dígitos, o 4 en Amex | `utils/tarjeta.ts` |
| 7 | La tarjeta **pertenece al cliente** autenticado | controladores |
| 8 | La tarjeta fue **verificada** al registrarse | `pago.controller.ts` |
| 9 | El **pedido** es del cliente, está pendiente y es de pago con tarjeta | `pago.controller.ts` |
| 10 | **Autorización** de la pasarela (simulada) | `services/pasarelaSimulada.ts` |
| 11 | **Límite de intentos** fallidos por usuario (anti *card testing*) | `middleware/limiteIntentos.middleware.ts` |

Las comprobaciones 1–6 son lógica pura (sin base de datos) y tienen pruebas
automáticas: `npm run test:tarjeta`.

---

## 2. Flujo

```
Registrar tarjeta                      Pagar un pedido
─────────────────                      ───────────────
POST /tarjetas                         POST /pagos/verificar-tarjeta
  │ ¿token válido? ¿rol CLIENTE?         │ ¿token válido? ¿rol CLIENTE?
  │ ¿bloqueado por intentos?             │ ¿bloqueado por intentos?
  ▼                                      ▼
validar número/Luhn/marca/venc./CVV    tarjeta del cliente → verificada → vigente
  ▼                                      ▼
¿ya registrada? (últ. 4 + marca + venc.) CVV con formato correcto
  ▼                                      ▼
pasarela: verificar (contexto          pedido del cliente, pendiente, con tarjeta
"verificacion")                          ▼
  ▼                                    pasarela: autorizar (contexto "pago", con monto)
guardar TARJETAS (token, últ. 4,         ▼
marca, vencimiento, verificada=1)      PEDIDOS.id_tarjeta = tarjeta   → 200 aprobado
```

El CVV y el número completo **nunca** se guardan: solo viajan en la petición y
se descartan.

---

## 3. Base de datos

Tablas que intervienen (de BD02): `USUARIOS` → `CLIENTES` → `TARJETAS` →
`PEDIDOS` (con `TIPOS_PAGO`, `CARRITO`, `DETALLE_CARRITO`, `PRODUCTOS`).

`TARJETAS` guarda, además del token y los últimos 4 dígitos, la marca y el vencimiento para poder **revalidar** una tarjeta guardada al pagar:

| Columna | Tipo | Nota |
|---|---|---|
| `id` | INT PK | |
| `id_cliente` | INT FK → `CLIENTES.id` | |
| `token_pago` | VARCHAR(255) **único** | token del procesador, no el número |
| `ultimos_digitos` | CHAR(4) | |
| `marca` | VARCHAR(20) | VISA / MASTERCARD / AMEX |
| `mes_expiracion` | TINYINT | |
| `anio_expiracion` | SMALLINT | |
| `verificada` | TINYINT(1) | 1 cuando la pasarela la aprobó |

El `seed` también crea el perfil del cliente demo en `CLIENTES`, los tipos de
pago y un pedido pendiente (2 × Pastel de chocolate = $700) para probar.

---

## 4. Endpoints (todos requieren `Authorization: Bearer <token>` y rol CLIENTE)

| Método y ruta | Descripción | Respuestas |
|---|---|---|
| `POST /tarjetas/verificar` | Solo valida los datos; no guarda nada | 200 (`valida` true/false con detalle) |
| `POST /tarjetas` | Valida, verifica con la pasarela y guarda | 201 · 402 rechazada · 409 duplicada · 422 inválida |
| `GET /tarjetas` | Tarjetas del cliente (sin token) | 200 |
| `DELETE /tarjetas/:id` | Elimina una tarjeta propia | 200 · 404 · 409 si está ligada a un pedido |
| `GET /pagos/pedidos-pendientes` | Pedidos por pagar con tarjeta y su monto | 200 |
| `POST /pagos/verificar-tarjeta` | Verifica la tarjeta para un pago | 200 aprobada · 402 rechazada · 404 · 409 · 422 |

Cuerpo de `/tarjetas/verificar` y `/tarjetas`:
`{ "numero": "4242 4242 4242 4242", "mes": 12, "anio": 2030, "cvv": "123" }`

Cuerpo de `/pagos/verificar-tarjeta`:
`{ "idTarjeta": 1, "cvv": "123", "idPedido": 1 }` (`idPedido` es opcional)

Códigos de rechazo (`codigo`): `tarjeta_vencida`, `cvv_invalido`,
`tarjeta_no_verificada`, `tarjeta_rechazada`, `fondos_insuficientes`.
Un usuario sin perfil en `CLIENTES` recibe 403; con demasiados fallos, 429 con `Retry-After`.

---

## 5. Tarjetas de prueba (pasarela simulada)

Hay dos tipos de error y se detectan en lugares distintos:

- **Errores de los datos** (Luhn, vencida, CVV, marca): los detecta nuestro propio código al
  momento, sin consultar a nadie → se ven con **"Solo verificar datos"** (y también al registrar).
- **Errores del banco** (rechazada, sin fondos, rechazo al cobrar): **solo los conoce el banco**.
  Un número puede ser perfectamente válido en formato y aun así ser rechazado, por eso
  **"Solo verificar datos" los da por buenos**. Aparecen cuando se consulta a la pasarela:
  al **registrar** la tarjeta o al **pagar**.

| Número | Solo verificar datos | Verificar y registrar | Verificar en el pago |
|---|---|---|---|
| `4242 4242 4242 4242` (Visa) | ✓ válida | 201 guardada | 200 aprobado |
| `5555 5555 5555 4444` (Mastercard) | ✓ válida | 201 guardada | 200 aprobado |
| `3782 822463 10005` (Amex, CVV de 4) | ✓ válida | 201 guardada | 200 aprobado |
| `4242 4242 4242 4241` | ✗ falla Luhn | 422 inválida | — |
| `4242 4242 4242 4242` con vencimiento 01/2020 | ✗ vencida | 422 inválida | — |
| `4000 0000 0000 0002` | ✓ válida | **402 `tarjeta_rechazada`** (no se guarda) | — |
| `4000 0000 0000 9995` | ✓ válida | **402 `fondos_insuficientes`** (no se guarda) | — |
| `4000 0000 0000 0341` | ✓ válida | 201 guardada (sin error) | **402 `tarjeta_rechazada`** al cobrar |

En el probador web, al elegir cada ejemplo aparece un cuadro **"Qué esperar"** con esta misma
información, y la fila donde interviene el banco se resalta en amarillo.

---

## 6. Seguridad

- **Nunca** se guarda el número completo ni el CVV; los errores y logs no los incluyen.
- El `token_pago` jamás se devuelve al cliente.
- Una tarjeta o pedido de otro cliente responde **404** (no revela que existe).
- El límite de intentos frena a quien prueba números de tarjeta al azar
  (`MAX_INTENTOS_TARJETA`, `VENTANA_INTENTOS_MIN`; por defecto 10 fallos en 10 min).
  Está en memoria: con varias instancias del servidor habría que usar Redis.
- **Producción:** para cumplir PCI-DSS lo recomendable es que el número se capture
  con los campos seguros del procesador (hosted fields / checkout) y que **nunca
  llegue a este servidor**; aquí solo se recibiría el token. Este servicio recibe
  el número únicamente porque la pasarela es simulada.
- Solo se aceptan Visa, Mastercard y Amex. Para México conviene añadir Carnet
  (prefijos propios) cuando se conecte el procesador real.

---

## 7. Cómo conectar una pasarela real

Reemplaza `services/pasarelaSimulada.ts` conservando las dos funciones que usan
los controladores:

- `tokenizarTarjeta()` → crear el método de pago en el procesador y devolver su token/id.
- `autorizarTarjeta({ marca, ultimosDigitos, monto, contexto })` → verificación
  ($0) o autorización del cargo, devolviendo `{ aprobada, codigo, mensaje, codigoAutorizacion }`.

Los controladores, rutas, base de datos y el probador no cambian.

---

## 8. Archivos del servicio

```
src/
├── utils/tarjeta.ts                       Validaciones (Luhn, marca, vencimiento, CVV)
├── utils/limiteIntentos.ts                Contador de fallos por usuario
├── utils/{cliente,pedido,asyncHandler,jwt}.ts Helpers
├── middleware/{auth,role}.middleware.ts   JWT y verificarRol (del servicio de roles)
├── controllers/auth.controller.ts         Login (emite el JWT con el rol)
├── services/pasarelaSimulada.ts           Pasarela simulada (reemplazable)
├── middleware/limiteIntentos.middleware.ts
├── controllers/{tarjeta,pago}.controller.ts
└── routes/{tarjeta,pago}.routes.ts
public/index.html · tarjetas.js            Probador web
scripts/probar-validador.ts                Pruebas automáticas (npm run test:tarjeta)
database/bd02_tarjetas.sql                 Las 12 tablas del servicio (alternativa a Prisma)
```
