# Función: Agregar Producto — Proyecto SOA

Servicio REST independiente para registrar productos e inventario inicial
en la tienda de componentes de PC. Cualquier equipo puede integrarlo
consumiendo la API — **nadie necesita acceder a MySQL directamente.**

```
Frontend (cualquier tecnología)
        │  POST /api/productos (JSON)
        ▼
   API REST (C# / ASP.NET Core)
        │
        ▼
   MySQL: PRODUCTOS + STOCK
```

---

## 1. Requisitos previos

- [.NET 8 SDK](https://dotnet.microsoft.com/download) instalado
- MySQL Server corriendo localmente (o accesible por red)
- Visual Studio Code con la extensión **C# Dev Kit**
- (Opcional) extensión **Live Server** de VS Code, para abrir el frontend

## 2. Crear la base de datos

1. Abre tu cliente de MySQL (MySQL Workbench, DBeaver, o la terminal `mysql`).
2. Ejecuta el script `Database/schema.sql`:
   ```bash
   mysql -u root -p < Database/schema.sql
   ```
   Esto crea la base `tienda_pc`, las tablas `PROVEEDORES`, `PRODUCTOS`,
   `STOCK`, y dos proveedores de ejemplo (necesarios porque `PRODUCTOS`
   requiere un `id_proveedor` válido).

## 3. Configurar la conexión

Abre `Backend/appsettings.json` y reemplaza la contraseña con la tuya:

```json
"ConnectionStrings": {
  "TiendaPcDatabase": "Server=localhost;Port=3306;Database=tienda_pc;User=root;Password=TU_PASSWORD_AQUI;"
}
```

## 4. Ejecutar el backend

```bash
cd Backend
dotnet restore
dotnet run
```

Al iniciar, la terminal mostrará algo como:
```
Now listening on: http://localhost:5000
```
Anota ese puerto — si es distinto a `5000`, actualízalo en
`Frontend/script.js` (constante `API_BASE_URL`).

Puedes probar la API directamente desde el navegador abriendo:
```
http://localhost:5000/swagger
```
Ahí verás el contrato completo (Swagger UI) sin necesidad de leer el código.

## 5. Ejecutar el frontend de prueba

Abre `Frontend/index.html` con la extensión Live Server de VS Code
(clic derecho → "Open with Live Server"), o simplemente ábrelo
directamente en el navegador. Desde ahí puedes:

- Registrar un producto nuevo (llena el formulario y da clic en "Agregar producto")
- Ver la lista de productos ya registrados

---

## 6. Documentación para el equipo (integración)

### Endpoint principal

```
POST /api/productos
Content-Type: application/json
```

**Cuerpo de la petición:**
```json
{
  "nombre": "RTX 4060",
  "descripcion": "Tarjeta gráfica NVIDIA RTX 4060",
  "lote": "LOT001",
  "serie": "SN001",
  "caducidad": null,
  "idProveedor": 1,
  "costo": 6500,
  "precio": 7999,
  "stockActual": 10,
  "stockMinimo": 2,
  "stockMaximo": 20
}
```

**Respuesta exitosa — `201 Created`:**
```json
{
  "id": 25,
  "nombre": "RTX 4060",
  "descripcion": "Tarjeta gráfica NVIDIA RTX 4060",
  "lote": "LOT001",
  "serie": "SN001",
  "caducidad": null,
  "idProveedor": 1,
  "costo": 6500,
  "precio": 7999,
  "stockActual": 10,
  "stockMinimo": 2,
  "stockMaximo": 20
}
```

**Respuestas de error:**

| Código | Cuándo ocurre | Ejemplo de cuerpo |
|---|---|---|
| `400 Bad Request` | Datos inválidos (nombre vacío, precio negativo, stockMinimo > stockMaximo, etc.) | `{"error":"Validacion","detalles":["El nombre del producto es obligatorio."]}` |
| `404 Not Found` | El `idProveedor` no existe en la tabla `PROVEEDORES` | `{"error":"ProveedorNoExiste","detalles":["No existe un proveedor con id 99"]}` |

### Otros endpoints disponibles (de apoyo, no forman parte de la función asignada)

| Método | Ruta | Uso |
|---|---|---|
| `GET` | `/api/productos` | Lista todos los productos con su stock |
| `GET` | `/api/productos/{id}` | Consulta un producto puntual |

### Cómo lo consumen mis compañeros

No importa si su frontend/backend usa Node.js, PHP, Java, etc. — solo
necesitan hacer una petición HTTP estándar:

```javascript
fetch("http://localhost:5000/api/productos", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ nombre: "...", idProveedor: 1, costo: 100, precio: 150, ... })
});
```

**Nadie debe conectarse directamente a MySQL para agregar productos.**
Toda la lógica (validaciones, transacción entre `PRODUCTOS` y `STOCK`)
vive dentro de este servicio.

---

## 7. Estructura del código (para quien quiera modificarlo)

```
Backend/
├── Controllers/
│   └── ProductosController.cs   → Define las rutas HTTP (qué recibe, qué código de estado devuelve)
├── Services/
│   └── ProductoService.cs       → Reglas de negocio y validaciones (nada de SQL aquí)
├── Data/
│   └── ProductoRepository.cs    → Único lugar donde se habla con MySQL (incluye la transacción)
├── Models/
│   ├── ProductoRequest.cs       → Forma del JSON que se recibe
│   ├── ProductoResponse.cs      → Forma del JSON que se devuelve
│   └── ApiError.cs              → Forma del JSON de error
├── Program.cs                   → Arranque de la app, CORS, Swagger
└── appsettings.json             → Cadena de conexión a MySQL
```

La separación en 3 capas (Controller → Service → Repository) permite que,
si al integrar el proyecto final alguien necesita cambiar una validación,
solo toque `ProductoService.cs` sin arriesgar el resto del código.
