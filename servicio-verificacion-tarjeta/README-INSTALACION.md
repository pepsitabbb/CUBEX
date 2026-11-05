# CUBEX - Servicio de verificación de tarjetas

Este servicio se adapta al `schema.prisma` recibido. No ejecuta migraciones ni modifica tablas.

## 1. Instalar
En PowerShell, dentro de esta carpeta:

```powershell
npm install
```

## 2. Configurar .env
Copia `.env.example` a `.env` y configura:
- `DATABASE_URL`: conexión a la base de datos CUBEX.
- `JWT_SECRET`: exactamente el mismo secreto usado por el microservicio de login.
- `JWT_ISSUER`: déjalo vacío si el login no valida/emite issuer; si el login emite issuer, coloca el mismo valor.
- `PORT=3024`.

No compartas el `.env` ni el secreto JWT.

## 3. Generar Prisma y compilar

```powershell
npx prisma generate
npm run build
```

No ejecutar `prisma migrate reset`, `prisma db push` ni `prisma migrate dev`: este servicio solo consume las tablas existentes.

## 4. Iniciar

```powershell
npm run dev
```

Comprobar:
- `GET http://localhost:3024/health`
- `GET http://localhost:3024/auth/verificar-rol` con Bearer token.
- `GET http://localhost:3024/tarjetas` con token de un CLIENTE.
- `GET http://localhost:3024/pagos/pedidos-pendientes` con token de un CLIENTE.

## Rutas
- `POST /tarjetas/verificar` body `{ "numero":"4242424242424242", "mes":"12", "anio":"2030", "cvv":"123" }`
- `POST /tarjetas` mismo body: valida y registra token/últimos 4.
- `GET /tarjetas`
- `DELETE /tarjetas/:id`
- `GET /pagos/pedidos-pendientes`
- `POST /pagos/verificar-tarjeta` body `{ "idTarjeta":1, "cvv":"123", "idPedido":1 }` (`idPedido` es opcional).

## Consideraciones
- Login continúa siendo responsabilidad del microservicio de login. Este servicio NO crea un segundo login ni genera tokens incompatibles.
- El JWT de login debe tener `sub` numérico en texto y `rol` igual a `CLIENTE` para el cliente.
- La tabla `tarjetas` solo admite token, últimos cuatro y estado verificado. Los metadatos de marca/vencimiento se guardan dentro de `token_pago` con firma HMAC usando `JWT_SECRET`; no se guarda PAN ni CVV.
- La pasarela es simulada, no cobra dinero real. No usar con tarjetas reales.
- `tipoEntrega` no existe en el modelo `pedidos` recibido, por eso la respuesta de pedidos lo entrega como `null`.
