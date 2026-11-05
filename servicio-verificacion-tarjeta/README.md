# Servicio de Verificación de Tarjeta — Tienda de Repostería (BD02)

Versión **independiente** del servicio 19 (*Verificación de tarjeta*) del módulo
Ventas–Carrito. Node.js + TypeScript + Express + Prisma + JWT + MySQL.

Verifica las tarjetas en dos momentos: cuando el cliente **registra** una tarjeta
y cuando **paga** un pedido. La pasarela de pagos es **simulada** (reemplazable
por Stripe, Conekta o Mercado Pago sin tocar el resto del código).

> **Por qué incluye login y middleware de rol.** El servicio necesita saber *quién*
> es el cliente para validar que la tarjeta y el pedido le pertenecen. Por eso
> trae lo mínimo del servicio de Verificación de Rol (`/auth/login`, JWT y
> `verificarRol`). Son los mismos archivos del proyecto completo.

## Qué verifica

Número (solo dígitos) · algoritmo de **Luhn** · **marca** (Visa, Mastercard, Amex) y
longitud · **vencimiento** vigente · **CVV** (3 dígitos, 4 en Amex) · la tarjeta y el
pedido son **del cliente** · tarjeta verificada · pedido pendiente y de pago con
tarjeta · **autorización** de la pasarela · **límite de intentos** fallidos (anti
*card testing*). El número completo y el CVV **nunca se guardan**.

## Inicio rápido

```bash
docker compose up -d            # MySQL en localhost:3306
cp .env.example .env            # variables de entorno
npm install
npm run prisma:migrate          # crea las 12 tablas
npm run prisma:seed             # roles, usuarios demo, cliente, pedido de ejemplo
npm run dev
```

Abre **http://localhost:3000** (el probador web). Usuarios de prueba:
`cliente@tienda.com / cliente123` (CLIENTE) y `admin@tienda.com / admin123` (ADMIN, recibe 403).

Pruebas automáticas del validador (sin base de datos): `npm run test:tarjeta`

Guía de instalación detallada: [`INSTALACION.md`](INSTALACION.md) ·
Documentación completa del servicio: [`docs/SERVICIO_VERIFICACION_TARJETA.md`](docs/SERVICIO_VERIFICACION_TARJETA.md)

## Endpoints (token JWT + rol CLIENTE)

| Método y ruta | Descripción |
|---|---|
| `POST /auth/login` | Inicia sesión y devuelve el JWT *(público)* |
| `POST /tarjetas/verificar` | Solo valida los datos; no guarda nada |
| `POST /tarjetas` | Valida, verifica con la pasarela y guarda la tarjeta |
| `GET /tarjetas` | Tarjetas del cliente (sin token de pago) |
| `DELETE /tarjetas/:id` | Elimina una tarjeta propia |
| `GET /pagos/pedidos-pendientes` | Pedidos por pagar con tarjeta y su monto |
| `POST /pagos/verificar-tarjeta` | Verifica la tarjeta para un pago `{ idTarjeta, cvv, idPedido? }` |

## Base de datos

12 tablas de BD02, idénticas a las de la base completa: `ROLES`, `USUARIOS`,
`CLIENTES`, `DIRECCIONES`, `CATEGORIAS`, `PRODUCTOS`, `STOCK`, `TIPOS_PAGO`,
`TARJETAS`, `CARRITO`, `DETALLE_CARRITO`, `PEDIDOS`.
Se pueden crear con Prisma (`npm run prisma:migrate`) o con `database/bd02_tarjetas.sql`.

## Estructura

```
src/
├── app.ts · server.ts
├── config/prisma.ts
├── controllers/   tarjeta · pago · auth (login)
├── middleware/    auth (JWT) · role (verificarRol) · limiteIntentos
├── routes/        tarjeta · pago · auth
├── services/      pasarelaSimulada.ts        <- se reemplaza por la pasarela real
├── types/         auth.types.ts
└── utils/         tarjeta (validaciones) · limiteIntentos · jwt · cliente · pedido · asyncHandler
prisma/            schema.prisma (12 modelos) · seed.ts
database/          bd02_tarjetas.sql
public/            index.html · tarjetas.js · style.css   (probador web)
scripts/           probar-validador.ts                    (npm run test:tarjeta)
```
