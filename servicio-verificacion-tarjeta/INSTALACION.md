# Guía de instalación — Servicio de Verificación de Tarjeta en VS Code

## 1. Software necesario

| Herramienta | Para qué sirve | Verificación |
|---|---|---|
| **Visual Studio Code** | Editor | — |
| **Node.js 18 LTS o superior** | Ejecuta el servidor | `node -v` |
| **Docker Desktop** *(recomendado)* o MySQL 8 instalado | Base de datos | `docker -v` |

Extensiones recomendadas (VS Code las sugiere al abrir la carpeta): **Prisma** y
**REST Client**.

## 2. Abrir el proyecto
Descomprime el zip → VS Code: **Archivo → Abrir carpeta…** → `servicio-verificacion-tarjeta`
→ abre la terminal integrada (**Terminal → Nueva terminal**).

## 3. Base de datos
**Opción A — Docker (recomendada):**
```bash
docker compose up -d
```
Levanta MySQL en `localhost:3306` (usuario `usuario`, contraseña `password`, base `bd02`).
La primera vez tarda unos segundos; si el paso 5 falla con "connection refused", espera
10–15 segundos y reintenta.

**Opción B — MySQL instalado:** crea una base vacía `bd02` y ajusta `DATABASE_URL`
en el paso 4.

## 4. Variables de entorno
```bash
cp .env.example .env
```
Con Docker el valor por defecto ya funciona:
```
DATABASE_URL="mysql://usuario:password@localhost:3306/bd02"
JWT_SECRET="cualquier-texto-largo-y-aleatorio"
```

## 5. Dependencias y tablas
```bash
npm install
```
Elige **una** forma de crear las 12 tablas:

- **Con Prisma (recomendada):**
  ```bash
  npm run prisma:migrate
  ```
- **Con el script SQL** (MySQL Workbench, consola…): ejecuta `database/bd02_tarjetas.sql`
  y después `npx prisma generate`.

## 6. Datos de prueba
```bash
npm run prisma:seed
```
Crea: roles ADMIN y CLIENTE · `admin@tienda.com / admin123` · `cliente@tienda.com / cliente123`
(con su perfil en `CLIENTES`) · tipos de pago · un producto y **un pedido pendiente de pago
con tarjeta** (2 × Pastel de chocolate = $700). Es seguro repetirlo.

## 7. Levantar el servidor
```bash
npm run dev
```
Debe decir: `Servicio de Control de Acceso corriendo en http://localhost:3000`

## 8. Probar

### Probador web — http://localhost:3000
1. **Entrar como CLIENTE demo.**
2. Elige un ejemplo (p. ej. *Visa válida*) → **Solo verificar datos**: verás cada comprobación.
3. **Verificar y registrar tarjeta**: se guarda solo token, últimos 4 dígitos, marca y vencimiento.
4. En la sección 4: **Ver mis pedidos pendientes** → **Usar** → elige la tarjeta, escribe el CVV →
   **Verificar la tarjeta para este pago**. El pedido queda ligado a la tarjeta (`PEDIDOS.id_tarjeta`).

| Prueba | Resultado esperado |
|---|---|
| Número inválido (Luhn) | `valida: false`, falla "Verificación Luhn" |
| Vencida | `valida: false`, falla "Fecha de expiración" |
| Rechazada por el banco | "Solo verificar" → válida ✓ (el banco no se consulta). **"Verificar y registrar"** → HTTP 402 `tarjeta_rechazada` (no se guarda) |
| Fondos insuficientes | "Solo verificar" → válida ✓. **"Verificar y registrar"** → HTTP 402 `fondos_insuficientes` (no se guarda) |
| "Se registra, pero rechaza al pagar" | "Verificar y registrar" → 201 (sin error). El rechazo aparece en la **sección 4** al verificar el pago: HTTP 402 `tarjeta_rechazada` |
| Entrar como ADMIN y verificar | HTTP 403 (el middleware de rol bloquea) |
| Fallar muchas veces seguidas | HTTP 429 (límite de intentos) |

> **Importante:** el botón "Solo verificar datos" solo revisa el formato (Luhn, marca,
> vencimiento, CVV) y **no consulta al banco**. Los rechazos del banco y la falta de fondos
> solo aparecen con "Verificar y registrar" o al pagar. Al elegir cada ejemplo, el probador
> muestra un cuadro "Qué esperar" que lo indica.

Para ver el bloqueo rápido, pon `MAX_INTENTOS_TARJETA=3` en `.env` y reinicia el servidor
(el contador vive en memoria; reiniciar lo borra).

### Con REST Client
Abre `requests.http` y pulsa **Send Request** sobre cada bloque (el login guarda el token).

### Pruebas automáticas del validador
```bash
npm run test:tarjeta
```

## Resolución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| `JWT_SECRET no esta definido` | No copiaste `.env.example` a `.env` | Repite el paso 4 |
| `Can't reach database server` | Docker apagado o puerto 3306 ocupado | `docker compose up -d`; si tienes otro MySQL, cambia el puerto en `docker-compose.yml` y en `DATABASE_URL` |
| El probador dice "No se pudo conectar" | El servidor no está corriendo | Revisa `npm run dev` |
| `El usuario no tiene perfil de cliente` | Falta el registro en `CLIENTES` | `npm run prisma:seed` |
| "Ver mis pedidos pendientes" sale vacío | No se creó el pedido demo | `npm run prisma:seed` |
| Login `401` con las credenciales demo | No corriste el seed | `npm run prisma:seed` |
