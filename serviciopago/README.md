# Simulador de pasarela de pagos

Microservicio en FastAPI que simula el cobro con tarjeta. Recibe un pago, lo valida y responde `APPROVED` o `REJECTED`. en el que tambien se permite consultar y reembolsar.

Solo son pruebas. Como ya se sabe no hay banco real ni cobros. Todo se guarda en memoria y se pierde al reiniciar.


# 1. "requirements.txt"

```
fastapi>=0.110,<1.0
pydantic>=2.0,<3.0
uvicorn>=0.27,<1.0
```

Paquete, Para que se usa?

`fastapi` Framework web: define las rutas, sirve el HTML y genera un interactivo
`pydantic` Valida y tipa los datos de entrada y salida (`BaseModel`, `Field`, `field_validator`). Se exige la v2 porque `app.py` usa `field_validator`, que no existe en la v1.
`uvicorn` Servidor ASGI que ejecuta la aplicacion. Se usa la version base (sin `[standard]`) para mantener la instalacion ligera.

Requisitos del entorno: Python 3.10 o superior (el codigo usa la sintaxis `str | None`).

#Instalacion y ejecucion

bash
python -m venv .venv
source .venv/bin/activate - En Windows es .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app:app --reload

Servicio: `http://localhost:8000`


#2. `app.py`

El archivo esta dividido en cuatro secciones, de la capa mas pura a la mas externa:

Modelos, Reglas de negocio, Almacen en memoria, API (rutas)


#2.1 Modelos

*Enums*

Enum, Valores, Descripcion
`Marca`  `VISA`, `MASTERCARD`, `DESCONOCIDA` - Marca detectada de la tarjeta.
`Estado` `APPROVED`, `REJECTED`, `REFUNDED` - Estado de una transaccion.

`SolicitudPago` (entrada de `POST /api/pagos`)

Valida el formato de los datos. Si algo no cumple, la API responde `422` y no se crea el pago.

Campo, Obligatorio, Regla, 
`amount`, si Numero mayor a 0. |
`currency` Si Exactamente 3 letras (`MXN`, `usd`…). Se guarda en mayusculas.
`nombre` si Texto no vacio; los espacios en los extremos se recortan.
`apellidos` si Igual que `nombre`.
`payerEmail` si Formato `algo@dominio.ext`.
`cardNumber` si Exactamente 16 dIgitos. Se aceptan espacios y guiones, que se eliminan antes de validar.
`cvv` si Exactamente 3 digitos. |
`expiry` si Formato `MM/AA` con mes 01-12 y que no estW vencida
`description` no Texto libre. Se acepta, pero no se almacena.
}`externalReference` nNO  Referencia de tu sistema (ej. nImero de orden). Se devuelve tal cual.

Validadores personalizados:

- `_no_vacio`: rechaza `nombre` y `apellidos` formados solo por espacios.
- `_dieciseis_digitos`: limpia el numero y exige 16 digitos exactos; ni mas ni menos.
- `_no_vencida`: una tarjeta es valida hasta el ultimo dia del mes indicado.

`RespuestaPago` (salida y registro guardado)

Campo, Descripcion
`providerPaymentId` Un ID unico de la transaccion
`status` `APPROVED`, `REJECTED` o `REFUNDED`.
`motivo` Explicacion legible del resultado.
`amount`, `currency` | Monto y moneda.
`titular` `"{nombre} {apellidos}"`.
`marca` Marca detectada.
`ultimos4` ultimos 4 digitos de la tarjeta.
`externalReference` Referencia opcional recibida

#2.2 Reglas de negocio

Son funciones puras ya que no dependen de FastAPI ni del almacen, por lo que se pueden probar de forma aislada.

`detectar_marca(numero)`

Marca, Patron, y siempre 16 digitos
Visa | Empieza con `4`.
Mastercard, Empieza con `51`-`55`, o con `2221`-`2720`.
Desconocida, Cualquier otro caso.

`es_valido_luhn(numero)`

Aplica el algoritmo de Luhn: desde la derecha se duplica un digito si y uno no (restando 9 si el resultado pasa de 9) y se suman todos. El numero es valido si la suma es multiplo de 10. Detecta errores de tecleo.

`evaluar(numero)` - `(estado, motivo, marca)`

Decide el resultado revisando en este orden y deteniendose en la primera falla:

Condicion, Resultado, Motivo

1. Marca desconocida `REJECTED` Marca no soportada (solo Visa y Mastercard)
2.  Falla Luhn `REJECTED` Numero de tarjeta invalido (falla Luhn)
3. Termina en `0002` `REJECTED` Fondos insuficientes (simulado)
4. Ninguna anterior `APPROVED` pago aprobado (simulado)

#2.3 Almacen en memoria

`_transacciones`: diccionario `{providerPaymentId: RespuestaPago}`.
`_lock`: `Lock` de `threading` que protege el diccionario cuando varias peticiones llegan a la vez.
`_obtener(payment_id)`: busca una transaccion o lanza `404`.

Seguridad: el numero completo de tarjeta y el CVV se usan solo para validar y nunca se guardan ni se devuelven. Solo se conservan la marca y los ultimos 4 digitos.

#2.4 API

Metodo, Ruta, Descripcion
`GET` `/` Sirve `index.html` misma origen que la API, sin CORS
`POST` `/api/pagos` Crea un pago.
`GET` `/api/pagos/{id}` Consulta el estado de un pago.
`POST` `/api/pagos/{id}/reembolso` Reembolsa un pago aprobado.

cOdigos de respuesta

Codigo, cuando ocurre
`200` Operacion procesada. Un pago rechazado por reglas de negocio tambiem es `200`, con `status: "REJECTED"`.
`400` Reembolso de un pago que no esta `APPROVED`.
`404` El ID de transaccion no existe. |
`422`Formato invalido campo vacío, tarjeta que no tiene 16 digitos, CVV mal, tarjeta vencida

Formato de los errores `422` (manejador `_errores_de_formato`)

json
{
  "detail": "cardNumber: debe tener exactamente 16 digitos",
  "errors": { "cardNumber": "debe tener exactamente 16 digitos" }
}

`detail` es un resumen en texto y `errors` indica el mensaje de cada campo.

Reembolso: la consulta y el cambio de estado ocurren dentro del mismo `Lock`, asi que dos reembolsos simultaneos del mismo pago no pueden aprobarse a la vez. Al reembolsar, `status` pasa a `REFUNDED` y `motivo` a "Reembolso simulado exitoso". Un segundo intento devuelve `400`.


#3. Ejemplos con `curl`

Crear un pago

bash
curl -X POST http://localhost:8000/api/pagos \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "currency": "MXN",
    "nombre": "Ana",
    "apellidos": "Pérez",
    "payerEmail": "ana@correo.com",
    "cardNumber": "4242 4242 4242 4242",
    "cvv": "123",
    "expiry": "12/30",
    "externalReference": "orden-001"
  }'

Respuesta:

json
{
  "providerPaymentId": "b3c1...",
  "status": "APPROVED",
  "motivo": "Pago aprobado (simulado)",
  "amount": 1000.0,
  "currency": "MXN",
  "titular": "Ana Pérez",
  "marca": "VISA",
  "ultimos4": "4242",
  "externalReference": "orden-001"
}

Consultar y reembolsar

bash
curl http://localhost:8000/api/pagos/<ID>
curl -X POST http://localhost:8000/api/pagos/<ID>/reembolso


#4. Tarjetas de prueba

NUmero, Marca, Resultado
`4242 4242 4242 4242` Visa Aprobada
`5555 5555 5555 4444` Mastercard Aprobada
`4000 0000 0000 0002` Visa Rechazada: fondos insuficientes
`4242 4242 4242 4241` Visa Rechazada: falla Luhn
`4242 4242 4242 424` (15 digitos) Error `422`: debe tener 16 digitos

#5. Limitaciones

Memoria volatil: al reiniciar el servicio se pierden todas las transacciones.
Un solo proceso: si ejecutas varios workers (`--workers N`), cada uno tiene su propia memoria y no comparten transacciones. Para produccionn habria que usar una base de datos.
Sin autenticacion cualquiera con acceso a la URL puede crear, consultar y reembolsar pagos.
Solo Visa y Mastercard de 16 digitos
No es una pasarela real: no cumple PCI-DSS ni debe usarse con tarjetas reales.