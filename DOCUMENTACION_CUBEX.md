# CUBEX — Documentación de la actualización

Inventario automático, logística (envíos, rastreo, validación de entregas), postventa (garantías y devoluciones), cuenta del cliente, seguridad y corrección de rutas tras mover el frontend a `public/`.

> **Estado de las pruebas (léelo primero).** En el entorno donde se hizo este trabajo **no fue posible instalar MySQL** (sin acceso a internet). Las pruebas se ejecutaron con los microservicios **reales** (Node y Python) sobre una base **SQLite** que emula las tablas de `tienda_db` (ver sección 13). La lógica quedó verificada (111/111 comprobaciones), pero **la sintaxis SQL específica de MySQL y la migración no se ejecutaron contra MySQL**. Antes de usarlo en serio, sigue la sección 13.3.

---

## 1. Instalación rápida (resumen)

1. **Respalda tu base**: `mysqldump -u root -p tienda_db > respaldo_tienda_db.sql`
2. **Ejecuta la migración** (no destructiva, se puede repetir):
   `mysql -u root -p tienda_db < database/01_migracion_cubex_inventario_logistica_postventa.sql`
3. **Copia tus `.env`** originales a cada servicio (el ZIP no incluye credenciales).
4. **Ejecuta una vez** `CONFIGURAR_ENV.bat` (o `node configurar-env.js`). Agrega a los `.env` que lo necesitan `JWT_SECRET`, `JWT_ISSUER` (copiados de `microservicio-login/.env`), una clave interna `CUBEX_SERVICE_KEY` compartida y las URLs internas. **Nunca modifica valores existentes.**
5. **Instala dependencias** en cada servicio Node (`npm install`) y en cada servicio Python (`pip install -r requirements.txt` dentro de su `venv`). Ver sección 3.
6. **Inicia todo** con `INICIAR_CUBEX.bat`. Se abre `http://127.0.0.1:5500/pages/index.html`.

---

## 2. Auditoría: qué se encontró

| Área | Hallazgo | Estado |
|---|---|---|
| Inventario | El stock **nunca se descontaba** al confirmar un pedido; `ventas`/`detalle_ventas` vacías | Corregido |
| Catálogo | Mostraba productos sin existencias (8, 10, 14, 15, 16, 17 no tenían fila en `stock`) | Corregido |
| Pago | El servicio 3012 cambiaba el pedido con `PATCH /estado` y el navegador volvía a llamar `/confirmar-pago` (doble confirmación). Cualquiera podía confirmar un pedido sin pagar | Corregido |
| Pago (3024) | Usaba el **id del carrito como id del pedido**; el monto ignoraba las ofertas | Corregido |
| Seguridad | Pedidos (3011), inventario (3005) y logística (3032) **sin autenticación**: se podían leer pedidos ajenos, cambiar stock o borrar productos. El catálogo público exponía el **costo** | Corregido |
| Ticket PDF | Cualquiera podía descargar el ticket (nombre y correo) de cualquier pedido | Corregido |
| Rutas | `admin.html` → `pages/productos.html` (404); `index.html` cargaba el carrito dos veces y buscaba `pages/carrito.html` (404); `.bat` servía la raíz y abría `/index.html` (ya no existía); `reportes.js` pedía proveedores al puerto 3000 en lugar del 3009 | Corregido |
| Logística | Páginas de envíos/entregas/garantías/devoluciones guardaban en `localStorage`; formularios del admin "solo visuales". El servicio Python 3032 no leía su `.env`, usaba tablas en MAYÚSCULAS y no estaba en el `.bat` | Corregido |
| Errores previos | `productos.html` declaraba `formulario` dos veces (la vista previa de imagen no funcionaba); `comentarios.html` cargaba su script dos veces | Corregido |

**Servicios no usados por el `.bat`** (se conservan sin cambios): `RegistroPedidosService-main` (C#), `StockMinimo` (C# WinForms), `StockOfertasApi` (C#), `soa-agregar-producto` (C#), `domicilio/`, y `public/js/envios.js` (sin página que lo cargue). Los archivos vacíos `public/js/devoluciones.js`, `entregas.js`, `garantias.js` y `pages/usuarios.html` siguen igual.

---

## 3. Microservicios y puertos

| Puerto | Servicio | Tecnología | Cambios |
|---|---|---|---|
| 5500 | Frontend (`public/`) | `py -m http.server` | Ahora sirve `public/` |
| 3000 | servicio-roles | Node | — |
| 3001 | verificacion-bot | Node | — |
| 3002 | reset-password | Node/TS | — |
| **3005** | **inventario-service-main** | Node/Express | **Fuente única del stock**, movimientos, alertas, catálogo público, seguridad |
| 3007 | comentarios-resenas | Node | — |
| 3008 | Inventario (reportes) | Node | — |
| 3009 | servicio_proveedores | Python | — |
| **3011** | **registro-pedidos-service** | Node/Express | Pedidos seguros, confirmación idempotente, cancelación con reintegro |
| **3012** | **serviciopago** | Python/FastAPI | Valida pedido/monto/stock antes de cobrar; confirma en el servidor; revierte si no hay stock |
| 3019 | microservicio-domicilios | Node | — |
| 3020 | microservicio-login | Node | — (emite los JWT) |
| 3021 | servicio-reporte-compras | Node | — |
| **3024** | **servicio-verificacion-tarjeta** | Node/TS | Usa pedidos reales y confirma en el servidor (src y dist) |
| **3025** | **ticket_service** | Python/FastAPI | Solo dueño o personal; precio vendido |
| **3032** | **logistica_envios_python** | Python/Flask | **Ampliado**: envíos, rastreo, entregas, garantías, devoluciones |

No se crearon servicios nuevos: logística y postventa se integraron en el servicio Python existente (3032).

**Dependencias:** no se agregó ninguna dependencia nueva. La verificación de JWT (HS256) se implementó con las librerías estándar (`crypto` en Node, `hmac` en Python). En `logistica_envios_python` ejecuta una vez:

```bat
cd logistica_envios_python
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

---

## 4. Base de datos

Archivo: `database/01_migracion_cubex_inventario_logistica_postventa.sql` (documentado línea por línea). **No elimina** tablas, columnas, relaciones ni registros.

- **Nuevas tablas:** `movimientos_inventario`, `alertas_inventario`, `historial_envios`, `historial_garantias`, `historial_devoluciones`.
- **Columnas nuevas:** `productos.activo`; `detalle_carrito.precio_unitario`; `pedidos.total, clave_idempotencia, referencia_pago, procesando_desde, fecha_confirmacion, fecha_cancelacion, motivo_cancelacion`; `ventas.estado, origen`; `envios.observaciones, id_usuario_registro, fecha_creacion, fecha_actualizacion`; `validacion_entrega.recibido_por, observaciones, id_usuario_valido, fecha_registro, confirmado_cliente, fecha_confirmacion_cliente, comentario_cliente`; `garantias.folio, id_cliente, descripcion, evidencia, id_usuario_gestion, fecha_resolucion, fecha_actualizacion`; `devoluciones_venta` (folio, cliente, descripción, evidencia, preferencia, instrucciones, autorización, recepción, condición, reintegro, resolución, reembolso).
- **Restricciones:** `CHECK (stock_actual >= 0)`; únicos `ventas(id_pedido)`, `detalle_ventas(id_venta,id_producto)`, `envios(id_venta)`, `envios(num_guia)`, `validacion_entrega(id_envio)`, `movimientos_inventario(clave_operacion)`, folios; llaves foráneas nuevas hacia clientes, usuarios, pedidos, compras y devoluciones.
- **Datos derivados (no destructivos):**
  - Se crean filas de `stock` con **0** para productos que no tenían (su existencia real). **Consecuencia:** tras migrar, solo se muestran en la tienda los productos con existencias (con los datos del respaldo: *cubo X* (20), *Skewb Ultimate* (40) y *PYRAMINX* (13)). Registra entradas para mostrar los demás.
  - Se calcula `pedidos.total` donde estaba vacío.
  - Se crean `ventas`/`detalle_ventas` con `origen='migracion'` para pedidos que ya estaban confirmados, para poder registrar su envío. **No** generan movimientos de inventario (en su momento no se descontó stock), por lo que tampoco reintegran stock si se cancelan.

---

## 5. Cómo funciona el descuento automático de inventario

1. **Agregar al carrito no descuenta nada.** El carrito consulta `POST /api/inventario/disponibilidad` para avisar de agotados y limitar cantidades.
2. **Crear el pedido** (`POST /api/Pedidos`) valida existencias reales, toma el **precio del servidor** (con oferta activa), guarda `precio_unitario` y `total`, y deja el pedido **pendiente**. No descuenta. Una `clave_idempotencia` evita pedidos duplicados por doble clic.
3. **Pago:** el servicio de pagos (3012 o 3024) comprueba en el servidor que el pedido es del cliente, está pendiente, el monto coincide con su total y hay stock. Si se aprueba, **el propio servicio** llama a `PATCH /api/Pedidos/:id/confirmar-pago` con la clave interna. El navegador ya no puede confirmar pedidos.
4. **Confirmación (3011):** el pedido pasa de `pendiente` a `procesando` con un `UPDATE … WHERE estado='pendiente'` atómico (solo una solicitud lo logra). Luego pide al inventario la salida.
5. **Salida (3005)**, en **una transacción**: bloquea las filas de `stock` con `SELECT … FOR UPDATE` en orden de id, verifica todas las cantidades, descuenta y registra un movimiento por producto con `clave_operacion = venta:<pedido>:<producto>` (**única**). Si la venta ya se aplicó, responde `ya_aplicado` sin tocar el stock.
6. Se registran `ventas`/`detalle_ventas` y el pedido queda **confirmado**.
7. **Si no hay stock al pagar** (otro cliente compró la última unidad): no se descuenta nada, el pedido se cancela con motivo y el servicio de pagos **revierte el cargo** (simulado).
8. **Si el pago falla:** nunca se llama a confirmar; el pedido sigue pendiente y el stock intacto.
9. **Cancelación** (`PATCH /:id/estado` → `cancelado`, solo ADMIN): bloqueada si el envío ya salió (se usa devolución). Reintegra **solo lo realmente descontado**, con clave `cancelacion:<pedido>:<producto>` (no se reintegra dos veces; repetir la cancelación reintenta si falló).
10. **Devolución:** el inventario aumenta **solo** al registrar la recepción con condición **vendible** (clave `devolucion:<id>`). Dañado o no apto: no se reintegra.

Solo `inventario.service.js` modifica `stock_actual`. Las compras a proveedores, entradas manuales y ajustes (con motivo obligatorio) pasan por la misma función y quedan en el historial.

## 6. Cómo se ocultan los productos agotados

- `GET /api/productos/catalogo` (y `GET /api/productos` sin sesión de personal) se filtra **en MySQL**: `productos.activo = 1 AND stock.stock_actual > 0`. Stock 0, negativo, sin fila de stock o producto dado de baja ⇒ no aparece. No se envía el costo.
- `GET /api/productos/catalogo/buscar?q=` devuelve además los agotados que coinciden (solo nombre) para mostrar "no disponible por el momento".
- `GET /api/productos/:id` responde `disponible: false` y el botón "Agregar" se desactiva.
- Aunque alguien llame la API directamente, crear o confirmar el pedido se rechaza con **409 STOCK_INSUFICIENTE**.
- "Eliminar producto" ahora es **dar de baja** (eliminación lógica) y se puede **reactivar**; se conservan ventas, movimientos y reseñas.

## 7. Sincronización inventario – ventas – pedidos

- **Inventario (3005)** es la única fuente de existencias.
- **Pedidos (3011)** nunca escribe en `stock`; solicita salidas/reintegros con la clave interna.
- **Logística (3032)** solicita el reintegro de devoluciones vendibles.
- Cada cambio queda en `movimientos_inventario` (tipo, cantidad, stock anterior/resultante, pedido, compra, devolución, usuario, origen, motivo, fecha). El panel muestra **unidades vendidas por producto** y qué pedidos generaron cada descuento.
- Las claves únicas hacen que reintentos, pagos duplicados o servicios que se reinician no dupliquen movimientos.

---

## 8. Endpoints creados o modificados

Autenticación: `Authorization: Bearer <token de microservicio-login>`. Interno: cabecera `X-Servicio-Clave`.

### Inventario (3005)
| Método y ruta | Acceso |
|---|---|
| `GET /api/productos/catalogo` · `GET /api/productos/catalogo/buscar?q=` | Público |
| `GET /api/productos` · `GET /api/productos/:id` | Público (filtrado) / personal (completo) |
| `POST /api/productos` · `PUT /api/productos/:id` | ADMIN, VENDEDOR |
| `DELETE /api/productos/:id` (baja lógica) · `PATCH /api/productos/:id/reactivar` | ADMIN |
| `GET /api/stock` | ADMIN, VENDEDOR |
| `PUT /api/stock/:id_producto` (mín/máx; cambio de existencias = ajuste auditado) | ADMIN |
| `GET /api/compras` / `POST /api/compras` (registra entrada) | personal / ADMIN |
| `POST /api/ofertas/evaluar-descuento` · `/:id/aplicar` · `/:id/desactivar` | personal / ADMIN |
| `POST /api/inventario/disponibilidad` | Público |
| `POST /api/inventario/ventas/salida` · `/ventas/cancelacion` · `/devoluciones/reintegro` | Interno o ADMIN |
| `POST /api/inventario/entradas` | ADMIN, VENDEDOR |
| `POST /api/inventario/ajustes` | ADMIN |
| `GET /api/inventario/movimientos?id_producto&tipo&id_pedido&desde&hasta` | ADMIN, VENDEDOR |
| `GET /api/inventario/ventas-por-producto` · `GET /api/inventario/alertas` · `PATCH /api/inventario/alertas/leidas` | ADMIN, VENDEDOR |

### Pedidos (3011)
| Método y ruta | Acceso |
|---|---|
| `GET /api/Pedidos?estado&q` | ADMIN, VENDEDOR |
| `GET /api/Pedidos/mis-pedidos` | CLIENTE (solo los suyos, con productos y total) |
| `GET /api/Pedidos/usuario/:id_usuario` | El propio usuario o personal |
| `GET /api/Pedidos/:id` · `GET /api/Pedidos/:id/validar-stock` | Dueño, personal o interno (404 si es ajeno) |
| `POST /api/Pedidos` | CLIENTE |
| `PATCH /api/Pedidos/:id/confirmar-pago` | **Solo interno** o ADMIN |
| `PATCH /api/Pedidos/:id/cancelar` | CLIENTE (solo pendientes propios) |
| `PATCH /api/Pedidos/:id/estado` | ADMIN (confirmar manual / cancelar) |

### Logística y postventa (3032, prefijo `/api`)
| Método y ruta | Acceso |
|---|---|
| `GET /envios?estado&q&retrasados=1` · `GET /envios/por-enviar` · `GET /envios/buscar?guia=` · `GET /envios/:id` | ADMIN, VENDEDOR |
| `POST /envios` · `PATCH /envios/:id` | ADMIN, VENDEDOR |
| `GET /entregas?filtro=pendientes\|validadas` · `POST /envios/:id/entregar` | ADMIN, VENDEDOR |
| `GET /clientes/mis-envios` · `POST /clientes/envios/:id/confirmar-recepcion` | CLIENTE |
| `GET /postventa/catalogos` · `GET /postventa/elegibles` | Público / CLIENTE |
| `GET /postventa/evidencias/<garantias\|devoluciones>/:id` | Dueño o personal |
| `POST /garantias` (JSON o multipart con `evidencia`) · `GET /garantias/mias` | CLIENTE |
| `GET /garantias` · `PATCH /garantias/:id` | Personal (aprobar/rechazar/resolver: ADMIN) |
| `POST /devoluciones` · `GET /devoluciones/mias` · `POST /devoluciones/:id/enviado` | CLIENTE |
| `GET /devoluciones` · `PATCH /devoluciones/:id` `{accion: revisar\|aprobar\|rechazar\|en_proceso\|recibir\|resolver\|completar\|reintegrar}` | Personal (aprobar/rechazar/resolver/completar: ADMIN) |

### Pagos
- 3012 `POST /api/pagos`: valida pedido, monto y stock antes de cobrar; responde `pedidoConfirmado`; si no se puede confirmar, estado `REFUNDED`.
- 3024 `GET /pagos/pedidos-pendientes` (pedidos reales) y `POST /pagos/verificar-tarjeta` (requiere `idPedido`, confirma en el servidor).
- 3025 `GET /api/tickets/:id_pedido` requiere token (dueño o personal).

---

## 9. Estados

- **Pedido:** pendiente → procesando → confirmado; pendiente/confirmado → cancelado.
- **Envío:** pendiente, preparando, en_transito, en_reparto, entregado, incidencia, cancelado. En tránsito/reparto/entregado exigen guía. Entregado no retrocede. "Retrasado" = fecha estimada vencida y no entregado.
- **Garantía:** pendiente → en_revision → aprobada/rechazada → resuelta.
- **Devolución:** pendiente → en_revision → aprobada/rechazada → en_proceso → producto_recibido → reembolso_en_proceso → completada.
- **Plazos** (configurables en `logistica_envios_python/.env`): devolución 30 días y garantía 90 días después de la entrega. *Son supuestos: no encontré una política de CUBEX en el proyecto; ajústalos.*
- **Permisos de VENDEDOR:** ver/registrar envíos y entregas, entradas de inventario, tomar solicitudes en revisión y registrar recepción de devoluciones. Solo **ADMIN**: ajustes de inventario, bajas de productos, confirmar/cancelar pedidos, aprobar/rechazar/resolver garantías y devoluciones, reembolsos.

---

## 10. Frontend y rutas

- Estructura: `public/pages/*.html`, `public/css`, `public/js`. Todas las rutas se revisaron automáticamente (0 referencias rotas).
- `public/index.html` redirige a `pages/index.html`.
- **`public/js/config.js`**: URLs y puertos de todos los servicios en un solo lugar, y envío automático del token **solo** a los servicios de CUBEX. Todos los scripts usan `CUBEX_CONFIG`.
- **`public/js/comun.js` / `css/comun.css`**: avisos, ventanas modales, estados, tablas, línea de progreso, estados vacíos y de carga.
- **Cliente — `perfil.html` ("Mi cuenta")**: Mi perfil · Mis pedidos (productos, cantidades, precios, total, estado; pagar o cancelar pendientes; ticket) · Mis envíos (paquetería, guía copiable, fechas, línea de progreso, historial real, validación de entrega, enlace a la paquetería, "Ya recibí mi pedido") · Mis garantías · Mis devoluciones (folio, estado, instrucciones, recepción, reembolso, historial, fotografía).
- **Tienda:** existencias visibles ("Últimas 3 unidades"), aviso de búsquedas agotadas, carrito con validación del servidor, precio con oferta e imágenes corregidas.
- **Administrador:** Envíos y rastreo, Validación de entregas, Garantías y Devoluciones son módulos reales (iframes con altura automática); Inventario con alertas, entradas, ajustes, movimientos y unidades vendidas; resumen con datos reales; pedidos con cliente, total, productos y transiciones válidas; productos con baja/reactivación. El panel de empleado incluye los mismos módulos según sus permisos.

---

## 11. Seguridad

JWT verificado en 3005, 3011, 3032 y 3025 (firma, algoritmo HS256, expiración y emisor). Clave interna entre servicios. Validación de propiedad (404 para recursos ajenos). Consultas parametrizadas. Validación de cantidades (enteros > 0) y textos. Evidencias: solo JPG/PNG/WEBP verificados por su contenido, máximo 5 MB, nombre aleatorio y descarga autenticada. CORS configurable (`CORS_ORIGINS`). Sin credenciales en el ZIP.

---

## 12. Archivos

- **Nuevos:** `database/…sql`, `configurar-env.js`, `CONFIGURAR_ENV.bat`, `DOCUMENTACION_CUBEX.md`, `pruebas/logica/*`, `inventario-service-main/src/{config/seguridad.js, services/inventario.service.js, controllers/inventario.controller.js, routes/inventario.routes.js}`, `registro-pedidos-service/{config/seguridad.js, services/inventario.cliente.js, .env.example}`, `logistica_envios_python/{seguridad.py, uploads/postventa/}`, `ticket_service/app/seguridad.py`, `serviciopago/.env.example`, `public/index.html`, `public/js/{config.js, comun.js, admin-resumen.js, inventario-movimientos.js}`, `public/css/{comun.css, cuenta.css}`.
- **Modificados (75):** copia de cada original en **`_respaldo_original/`** con la misma ruta.
- **Eliminados:** ninguno.

---

## 13. Pruebas

### 13.1 Realizadas aquí
| Prueba | Resultado |
|---|---|
| Autorización con servicios reales (sin token, rol incorrecto, token alterado, `alg:none`, clave interna falsa, cantidades negativas/decimales, JSON mal formado) | 26/26 |
| Lógica de inventario y pedidos — escenarios 1 a 8, entradas, ajustes, compras, ofertas, seguridad (`pruebas/logica/pruebas.js`) | **52/52** |
| Extremo a extremo compra → envío → rastreo → entrega → garantía → devolución → reintegro, incluyendo Flask (`pruebas/logica/pruebas_logistica.py`) | **59/59** |
| Navegador (Chromium): catálogo, búsqueda de agotado, carrito con límite de stock, domicilio → creación real del pedido, registro de envío desde el admin, rastreo del cliente, 21 páginas | 0 errores 404, 0 errores de JavaScript |
| Sintaxis de todos los `.js`, compilación TypeScript (3024) y Python | OK |

Ejecutar de nuevo (Node 22+; para la segunda, Python con Flask y PyJWT):
```bat
node --no-warnings pruebas\logica\pruebas.js
python pruebas\logica\pruebas_logistica.py
```

### 13.2 No probado aquí (y por qué)
- **MySQL real y la migración**: MySQL no se pudo instalar en este entorno. SQLite reproduce la lógica, pero no valida la sintaxis exclusiva de MySQL (`ON DUPLICATE KEY`, `FOR UPDATE`, `INTERVAL`, procedimientos de la migración) ni el comportamiento de bloqueos de InnoDB bajo concurrencia real.
- **Servicios que no pude ejecutar**: 3012 (FastAPI no instalado), 3024 (Prisma necesita su motor), 3025 (xhtml2pdf), 3001/3019/3020 (simulados en la prueba de navegador). Su código fue revisado y compilado, pero no ejecutado.
- **Permanencia tras reiniciar servicios** contra MySQL.

### 13.3 Verificación recomendada con tu MySQL
1. Ejecuta la migración en una **copia** (`tienda_db_pruebas`) y apunta los `.env` a ella.
2. Ejecuta la migración **dos veces**: la segunda no debe dar errores.
3. Inicia todo y repite desde la interfaz: comprar 3 de un producto con 10 (queda 7); comprar hasta 0 (desaparece de la tienda); pagar con `4000 0000 0000 0002` (rechazada, stock igual); registrar envío, validar entrega, pedir y recibir una devolución vendible (stock sube).
4. Revisa `SELECT * FROM movimientos_inventario ORDER BY id DESC;`.

Si algo falla, el mensaje del servicio en su ventana de consola indicará la consulta; envíamelo y lo corrijo.

---

## 14. Pendientes conocidos
- El token de login dura **15 minutos** (`JWT_EXPIRES_IN` en `microservicio-login/.env`); al expirar, las páginas piden iniciar sesión de nuevo.
- Los pagos y reembolsos son **simulados** (como en el proyecto original); el reembolso se registra, no se ejecuta en una pasarela real.
- Las direcciones de rastreo de Estafeta, Paquetexpress y Correos de México abren su página oficial (no aceptan la guía en la URL); DHL y FedEx abren la guía directamente. Se editan en `public/js/config.js`.
- Los plazos de devolución/garantía son supuestos (ver sección 9).
- **Credencial expuesta:** `RegistroPedidosService-main/appsettings.json` (servicio C# no usado por el `.bat`) contenía la contraseña real de MySQL. En el ZIP se reemplazó por `TU_PASSWORD`; tu archivo local no se tocó. Te recomiendo **cambiar esa contraseña** si el proyecto se ha compartido o subido a un repositorio.
