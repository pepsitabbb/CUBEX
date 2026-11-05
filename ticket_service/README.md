# CUBEX - Microservicio de generación de tickets

Este servicio genera un PDF a partir de un pedido existente en la base MySQL `tienda_db` de CUBEX. No crea tablas ni modifica pedidos.

## Requisitos
- Python 3.11+
- MySQL accesible desde este servicio

## Instalación (Windows PowerShell)
```powershell
cd ticket_service
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```
Edita `.env` y coloca los mismos datos de conexión MySQL que usa CUBEX (`DATABASE_URL` con el usuario, contraseña y host correctos).

## Iniciar
```powershell
uvicorn app.main:app --host 0.0.0.0 --port 3025 --reload
```

## Endpoints
- `GET /api/salud`: comprobar que el servicio está activo.
- `GET /api/tickets/{id_pedido}`: descargar el ticket PDF del pedido.

El endpoint solo genera el PDF si `pedidos.estado` es `Confirmado` o `pagado` (sin distinguir mayúsculas/minúsculas). El servicio NO cambia el estado: el microservicio de pagos debe actualizarlo únicamente después de recibir una aprobación de la pasarela.

## Esquema utilizado
Lee `pedidos`, `carrito`, `detalle_carrito` y `productos`. No crea tablas. Calcula el total sumando cantidad por precio actual del producto. Si CUBEX maneja precios históricos por detalle, se debe adaptar la consulta para usar ese campo.

## Seguridad
No subas `.env`, contraseñas ni credenciales a GitHub. El servicio no recibe ni almacena número completo de tarjeta ni CVV.
