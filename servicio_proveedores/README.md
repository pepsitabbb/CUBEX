# Servicio REST de PROVEEDORES

API desarrollada con **Python \+ Flask \+ MySQL \+ JSON** para trabajar con la tabla `PROVEEDORES`.

## Campos del servicio

- `id` — PK  
- `nombre`  
- `razon_social`  
- `rfc`  
- `direccion`  
- `correo`  
- `telefono`

## 1\. Crear la base de datos

Ejecuta `schema.sql` en MySQL Workbench.

## 2\. Instalar dependencias

```sh
python -m venv venv
```

Windows:

```sh
venv\Scripts\activate
```

Linux/macOS:

```sh
source venv/bin/activate
```

Después:

```sh
pip install -r requirements.txt
```

## 3\. Configurar MySQL

Copia `.env.example` a `.env` y coloca tus credenciales.

Ejemplo:

```env
DB_HOST=localhost
DB_PORT=3306
DB_NAME=tienda
DB_USER=root
DB_PASSWORD=123456
```

&nbsp;

## 4\. Ejecutar

```sh
python app.py
```

El servicio quedará disponible en:

`http://localhost:5000`

## Endpoints

| Método | Endpoint | Función |
| :---- | :---- | :---- |
| GET | `/api/proveedores` | Listar proveedores |
| GET | `/api/proveedores/1` | Consultar un proveedor |
| POST | `/api/proveedores` | Registrar proveedor |
| PUT | `/api/proveedores/1` | Actualizar proveedor |
| DELETE | `/api/proveedores/1` | Eliminar proveedor |
| GET | `/api/health` | Verificar API y conexión MySQL |

## JSON para POST

```json
{
  "nombre": "Distribuidora Fitness",
  "razon_social": "Distribuidora Fitness S.A. de C.V.",
  "rfc": "DFI260101ABC",
  "direccion": "Av. Insurgentes #120, Culiacán, Sinaloa",
  "correo": "ventas@distribuidorafitness.com",
  "telefono": "6671234567"
}
```

Ejemplo de respuesta

```json
{
  "success": true,
  "message": "Proveedor creado correctamente",
  "data": {
    "id": 1,
    "nombre": "Distribuidora Fitness",
    "razon_social": "Distribuidora Fitness S.A. de C.V.",
    "rfc": "DFI260101ABC",
    "direccion": "Av. Insurgentes #120, Culiacán, Sinaloa",
    "correo": "ventas@distribuidorafitness.com",
    "telefono": "6671234567"
  }
}
```

Prueba rápida con curl

Registrar:

```sh
curl -X POST http://localhost:5000/api/proveedores ^
-H "Content-Type: application/json" ^
-d "{\"nombre\":\"Distribuidora Fitness\",\"razon_social\":\"Distribuidora Fitness S.A. de C.V.\",\"rfc\":\"DFI260101ABC\",\"direccion\":\"Av. Insurgentes #120\",\"correo\":\"ventas@distribuidorafitness.com\",\"telefono\":\"6671234567\"}"
```

Consultar:

```sh
curl http://localhost:5000/api/proveedores
```

Actualizar:

```sh
curl -X PUT http://localhost:5000/api/proveedores/1 ^
-H "Content-Type: application/json" ^
-d "{\"telefono\":\"6679999999\"}"
```

Eliminar:

```sh
curl -X DELETE http://localhost:5000/api/proveedores/1
```

&nbsp;