
"""
Microservicio simulador de pasarela de pagos CUBEX (FastAPI).

Endpoints:
GET  /                         -> Interfaz web
GET  /health                   -> Verificar funcionamiento
POST /api/pagos                -> Crear un pago
GET  /api/pagos/{id}           -> Consultar pago
POST /api/pagos/{id}/reembolso -> Reembolsar pago

Tarjetas de prueba:
4242 4242 4242 4242 -> Visa aprobada
5555 5555 5555 4444 -> Mastercard aprobada
4000 0000 0000 0002 -> Visa rechazada
"""

from __future__ import annotations

import os
import re
import json
import uuid

from datetime import date
from enum import Enum
from pathlib import Path
from threading import Lock

from urllib.request import Request as URLRequest, urlopen
from urllib.error import HTTPError, URLError

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

from pydantic import BaseModel, Field, field_validator


# --------------------------------------------------------------------------
# VARIABLES DE ENTORNO (.env junto a app.py, sin dependencias extra)
# --------------------------------------------------------------------------

def _cargar_env() -> None:
    ruta = Path(__file__).with_name(".env")

    if not ruta.exists():
        return

    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.strip()

        if not linea or linea.startswith("#") or "=" not in linea:
            continue

        clave, valor = linea.split("=", 1)
        clave = clave.strip()
        valor = valor.strip().strip('"').strip("'")

        if clave and clave not in os.environ:
            os.environ[clave] = valor


_cargar_env()


# --------------------------------------------------------------------------
# MODELOS
# --------------------------------------------------------------------------

class Marca(str, Enum):
    VISA = "VISA"
    MASTERCARD = "MASTERCARD"
    DESCONOCIDA = "DESCONOCIDA"


class Estado(str, Enum):
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    REFUNDED = "REFUNDED"


class SolicitudPago(BaseModel):

    amount: float = Field(gt=0, description="Monto mayor a 0")

    currency: str = Field(
        pattern=r"^[A-Za-z]{3}$",
        description="Código de moneda de 3 letras"
    )

    nombre: str = Field(min_length=1, description="Nombre del titular")

    apellidos: str = Field(min_length=1, description="Apellidos del titular")

    payerEmail: str = Field(
        pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
    )

    cardNumber: str

    cvv: str = Field(pattern=r"^\d{3}$")

    expiry: str = Field(pattern=r"^(0[1-9]|1[0-2])/\d{2}$")

    description: str | None = None

    # Aquí se recibe el ID real del pedido de CUBEX
    externalReference: str | None = None

    @field_validator("nombre", "apellidos")
    @classmethod
    def no_vacio(cls, v: str) -> str:

        v = v.strip()

        if not v:
            raise ValueError("no puede estar vacío")

        return v

    @field_validator("cardNumber")
    @classmethod
    def dieciseis_digitos(cls, v: str) -> str:

        limpio = re.sub(r"[\s-]", "", v)

        if not re.fullmatch(r"\d{16}", limpio):
            raise ValueError("debe tener exactamente 16 dígitos")

        return limpio

    @field_validator("expiry")
    @classmethod
    def no_vencida(cls, v: str) -> str:

        mes = int(v[:2])
        anio = 2000 + int(v[3:])

        hoy = date.today()

        if (anio, mes) < (hoy.year, hoy.month):
            raise ValueError("la tarjeta está vencida")

        return v


class RespuestaPago(BaseModel):

    providerPaymentId: str
    status: Estado
    motivo: str
    amount: float
    currency: str
    titular: str
    marca: Marca
    ultimos4: str
    externalReference: str | None = None
    pedidoConfirmado: bool = False
    codigo: str | None = None


# --------------------------------------------------------------------------
# REGLAS DE NEGOCIO
# --------------------------------------------------------------------------

_RE_VISA = re.compile(r"4\d{15}")

_RE_MASTERCARD = re.compile(
    r"5[1-5]\d{14}|2(?:22[1-9]|2[3-9]\d|[3-6]\d{2}|7[01]\d|720)\d{12}"
)


def detectar_marca(numero: str) -> Marca:

    if _RE_VISA.fullmatch(numero):
        return Marca.VISA

    if _RE_MASTERCARD.fullmatch(numero):
        return Marca.MASTERCARD

    return Marca.DESCONOCIDA


def es_valido_luhn(numero: str) -> bool:

    suma = 0

    for i, c in enumerate(reversed(numero)):

        d = int(c)

        if i % 2 == 1:
            d = d * 2 - 9 if d > 4 else d * 2

        suma += d

    return suma % 10 == 0


def evaluar(numero: str) -> tuple[Estado, str, Marca]:

    marca = detectar_marca(numero)

    if marca is Marca.DESCONOCIDA:
        return (
            Estado.REJECTED,
            "Marca no soportada (solo Visa y Mastercard)",
            marca
        )

    if not es_valido_luhn(numero):
        return (
            Estado.REJECTED,
            "Número de tarjeta inválido (falla Luhn)",
            marca
        )

    if numero.endswith("0002"):
        return (
            Estado.REJECTED,
            "Fondos insuficientes (simulado)",
            marca
        )

    return (
        Estado.APPROVED,
        "Pago aprobado (simulado)",
        marca
    )


# --------------------------------------------------------------------------
# ALMACÉN EN MEMORIA
# --------------------------------------------------------------------------

_transacciones: dict[str, RespuestaPago] = {}

_lock = Lock()


def _obtener(payment_id: str) -> RespuestaPago:

    with _lock:
        pago = _transacciones.get(payment_id)

    if pago is None:
        raise HTTPException(
            status_code=404,
            detail="Transacción no encontrada"
        )

    return pago


# --------------------------------------------------------------------------
# CONFIGURACIÓN DEL MICROSERVICIO DE PEDIDOS
# --------------------------------------------------------------------------

PEDIDOS_API_URL = os.getenv(
    "PEDIDOS_API_URL",
    "http://localhost:3011/api/Pedidos"
).rstrip("/")

# Clave compartida entre microservicios (cabecera X-Servicio-Clave).
SERVICE_KEY = os.getenv("CUBEX_SERVICE_KEY", "").strip()

# Pedidos que se están cobrando en este momento (evita cobros dobles
# cuando el mismo pago se envía dos veces al mismo tiempo).
_pedidos_en_proceso: set[str] = set()


def llamar_pedidos(metodo: str, ruta: str, cuerpo: dict | None = None) -> tuple[int, dict]:
    """Llama al microservicio de pedidos con la clave interna."""

    datos = json.dumps(cuerpo).encode("utf-8") if cuerpo is not None else None

    solicitud = URLRequest(
        f"{PEDIDOS_API_URL}{ruta}",
        data=datos,
        headers={
            "Content-Type": "application/json",
            "X-Servicio-Clave": SERVICE_KEY,
        },
        method=metodo,
    )

    try:
        with urlopen(solicitud, timeout=20) as respuesta:
            return respuesta.status, json.loads(respuesta.read().decode("utf-8") or "{}")

    except HTTPError as error:
        try:
            contenido = json.loads(error.read().decode("utf-8", errors="replace") or "{}")
        except ValueError:
            contenido = {}

        return error.code, contenido

    except (URLError, TimeoutError, OSError) as error:
        print(f"No se pudo conectar con el microservicio de pedidos: {error}")
        return 503, {"mensaje": "El servicio de pedidos no está disponible."}


def validar_pedido_antes_de_cobrar(id_pedido: str, monto: float) -> dict:
    """
    Comprueba en el servidor (no en el navegador) que el pedido existe,
    está pendiente, que el monto coincide con su total y que todavía
    hay existencias. Así no se cobra un pedido que no puede surtirse.
    """

    if not SERVICE_KEY:
        raise HTTPException(500, "Falta configurar CUBEX_SERVICE_KEY en serviciopago/.env")

    if not re.fullmatch(r"\d{1,10}", str(id_pedido or "")):
        raise HTTPException(400, "El identificador del pedido no es válido.")

    estado_http, respuesta = llamar_pedidos("GET", f"/{id_pedido}")

    if estado_http == 404:
        raise HTTPException(404, "El pedido no existe.")

    if estado_http != 200:
        raise HTTPException(503, respuesta.get("mensaje") or "No se pudo validar el pedido.")

    pedido = respuesta.get("datos") or {}
    estado = str(pedido.get("estado") or "").lower()

    if estado == "confirmado":
        raise HTTPException(409, "Este pedido ya fue pagado.")

    if estado != "pendiente":
        raise HTTPException(409, f"El pedido no puede pagarse porque está {estado or 'sin estado'}.")

    total = float(pedido.get("total") or 0)

    if total <= 0 or abs(total - float(monto)) > 0.01:
        raise HTTPException(
            422,
            f"El monto enviado no coincide con el total del pedido ({total:.2f} MXN)."
        )

    estado_http, stock = llamar_pedidos("GET", f"/{id_pedido}/validar-stock")

    if estado_http == 200 and not (stock.get("datos") or {}).get("disponible", False):
        faltantes = (stock.get("datos") or {}).get("faltantes") or []
        nombres = ", ".join(str(f.get("nombre")) for f in faltantes) or "algunos productos"
        raise HTTPException(409, f"Sin existencias suficientes de: {nombres}. Actualiza tu carrito.")

    return pedido


def confirmar_pedido(id_pedido: str, referencia: str) -> tuple[bool, str, str | None]:
    """
    Confirma el pedido en el microservicio de pedidos. Allí se descuenta
    el inventario una sola vez (operación idempotente).
    Devuelve (confirmado, mensaje, codigo).
    """

    estado_http, respuesta = llamar_pedidos(
        "PATCH",
        f"/{id_pedido}/confirmar-pago",
        {"referencia_pago": referencia},
    )

    if estado_http == 200:
        return True, respuesta.get("mensaje") or "Pedido confirmado.", None

    if estado_http == 503:
        # No sabemos si llegó a confirmarse: se consulta antes de decidir.
        estado_consulta, consulta = llamar_pedidos("GET", f"/{id_pedido}")

        if estado_consulta == 200 and str((consulta.get("datos") or {}).get("estado", "")).lower() == "confirmado":
            return True, "Pedido confirmado.", None

    return False, respuesta.get("mensaje") or "No se pudo confirmar el pedido.", respuesta.get("codigo")


# --------------------------------------------------------------------------
# APLICACIÓN FASTAPI
# --------------------------------------------------------------------------

app = FastAPI(
    title="Simulador de pasarela de pagos CUBEX",
    version="1.0.0"
)


# --------------------------------------------------------------------------
# CONFIGURACIÓN CORS
# --------------------------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origen.strip()
        for origen in os.getenv(
            "CORS_ORIGINS",
            "http://127.0.0.1:5500,http://localhost:5500,https://cubex-tienda.netlify.app"
        ).split(",")
        if origen.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


INDEX_HTML = Path(__file__).with_name("index.html")


# --------------------------------------------------------------------------
# ERRORES DE VALIDACIÓN
# --------------------------------------------------------------------------

@app.exception_handler(RequestValidationError)
async def errores_de_formato(
    _: Request,
    exc: RequestValidationError
) -> JSONResponse:

    errores = {
        str(e["loc"][-1]): str(e["msg"]).removeprefix("Value error, ")
        for e in exc.errors()
    }

    resumen = "; ".join(
        f"{campo}: {msg}"
        for campo, msg in errores.items()
    )

    return JSONResponse(
        status_code=422,
        content={
            "detail": resumen,
            "errors": errores
        }
    )


# --------------------------------------------------------------------------
# RUTAS
# --------------------------------------------------------------------------

@app.get("/", include_in_schema=False)
def inicio() -> FileResponse:

    if not INDEX_HTML.exists():
        raise HTTPException(
            status_code=404,
            detail="No se encontró index.html"
        )

    return FileResponse(INDEX_HTML)


@app.get("/health")
def salud():

    return {
        "exitoso": True,
        "mensaje": "Microservicio de pagos CUBEX funcionando"
    }


# --------------------------------------------------------------------------
# CREAR PAGO Y CONFIRMAR PEDIDO AUTOMÁTICAMENTE
# --------------------------------------------------------------------------

@app.post("/api/pagos", response_model=RespuestaPago)
def crear_pago(s: SolicitudPago) -> RespuestaPago:

    referencia_pedido = str(s.externalReference or "").strip()

    if not referencia_pedido:
        raise HTTPException(400, "Falta el identificador del pedido (externalReference).")

    # Evitar que el mismo pedido se cobre dos veces simultáneamente.
    with _lock:
        if referencia_pedido in _pedidos_en_proceso:
            raise HTTPException(409, "El pago de este pedido ya se está procesando.")

        _pedidos_en_proceso.add(referencia_pedido)

    try:
        validar_pedido_antes_de_cobrar(referencia_pedido, s.amount)

        estado, motivo, marca = evaluar(s.cardNumber)

        pago = RespuestaPago(
            providerPaymentId=str(uuid.uuid4()),
            status=estado,
            motivo=motivo,
            amount=s.amount,
            currency=s.currency.upper(),
            titular=f"{s.nombre} {s.apellidos}",
            marca=marca,
            ultimos4=s.cardNumber[-4:],
            externalReference=referencia_pedido
        )

        if pago.status is Estado.APPROVED:

            confirmado, mensaje, codigo = confirmar_pedido(
                referencia_pedido,
                f"PAGO-{pago.providerPaymentId}"
            )

            if confirmado:
                pago = pago.model_copy(update={"pedidoConfirmado": True})
                print(f"Pedido {referencia_pedido} confirmado. {mensaje}")

            else:
                # El cargo se revierte: el pedido no pudo confirmarse
                # (por ejemplo, otro cliente compró la última unidad).
                pago = pago.model_copy(update={
                    "status": Estado.REFUNDED,
                    "motivo": f"{mensaje} El cargo fue revertido (simulado).",
                    "codigo": codigo or "PEDIDO_NO_CONFIRMADO",
                })
                print(f"ATENCIÓN: pedido {referencia_pedido} no confirmado: {mensaje}")

        else:
            print(f"Pago rechazado. Pedido {referencia_pedido} sin cambios.")

        with _lock:
            _transacciones[pago.providerPaymentId] = pago

        return pago

    finally:
        with _lock:
            _pedidos_en_proceso.discard(referencia_pedido)


# --------------------------------------------------------------------------
# CONSULTAR PAGO
# --------------------------------------------------------------------------

@app.get(
    "/api/pagos/{payment_id}",
    response_model=RespuestaPago
)
def consultar_pago(payment_id: str) -> RespuestaPago:

    return _obtener(payment_id)


# --------------------------------------------------------------------------
# REEMBOLSAR PAGO
# --------------------------------------------------------------------------

@app.post(
    "/api/pagos/{payment_id}/reembolso",
    response_model=RespuestaPago
)
def reembolsar_pago(payment_id: str) -> RespuestaPago:

    with _lock:

        original = _transacciones.get(payment_id)

        if original is None:
            raise HTTPException(
                status_code=404,
                detail="Transacción no encontrada"
            )

        if original.status is not Estado.APPROVED:
            raise HTTPException(
                status_code=400,
                detail="Solo se pueden reembolsar pagos aprobados"
            )

        reembolsado = original.model_copy(
            update={
                "status": Estado.REFUNDED,
                "motivo": "Reembolso simulado exitoso"
            }
        )

        _transacciones[payment_id] = reembolsado

    return reembolsado
