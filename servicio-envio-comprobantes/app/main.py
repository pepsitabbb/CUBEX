import smtplib
import requests

from email.message import EmailMessage

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import obtener_datos_cliente


app = FastAPI(
    title="CUBEX - Servicio de envío de comprobantes",
    version="1.0.0",
    description="Envía comprobantes PDF de compras confirmadas."
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"]
)


@app.get("/api/salud")
def salud():

    return {
        "exitoso": True,
        "mensaje": "Servicio de envío de comprobantes funcionando",
        "puerto": settings.APP_PORT
    }


@app.post("/api/comprobantes/enviar/{id_pedido}")
def enviar_comprobante(id_pedido: int):

    if id_pedido <= 0:
        raise HTTPException(
            status_code=400,
            detail="El ID del pedido no es válido."
        )

    # Verificar configuración SMTP
    if not settings.SMTP_USER or not settings.SMTP_PASSWORD:
        raise HTTPException(
            status_code=500,
            detail="Faltan las credenciales SMTP en el archivo .env."
        )

    # Obtener información del pedido y cliente
    try:
        pedido = obtener_datos_cliente(id_pedido)

    except Exception as error:
        print("Error consultando pedido:", error)

        raise HTTPException(
            status_code=500,
            detail="No fue posible consultar los datos del pedido."
        )

    if not pedido:
        raise HTTPException(
            status_code=404,
            detail="El pedido no existe."
        )

    # Verificar estado
    estado = str(pedido.get("estado") or "").strip().lower()

    if estado != "confirmado":
        raise HTTPException(
            status_code=409,
            detail="No se puede enviar el comprobante de un pedido no confirmado."
        )

    correo_cliente = pedido.get("correo")

    if not correo_cliente:
        raise HTTPException(
            status_code=409,
            detail="El cliente no tiene un correo electrónico registrado."
        )

    nombre_cliente = (
        pedido.get("nombre_completo")
        or pedido.get("nombre_usuario")
        or f"Cliente #{pedido.get('id_cliente')}"
    )

    # Recuperar PDF desde ticket_service
    try:
        respuesta_pdf = requests.get(
            f"{settings.TICKET_SERVICE_URL}/api/tickets/{id_pedido}",
            timeout=30
        )

        if respuesta_pdf.status_code != 200:
            print("Error del servicio de tickets:", respuesta_pdf.text)

            raise HTTPException(
                status_code=respuesta_pdf.status_code,
                detail="No fue posible obtener el PDF del comprobante."
            )

        contenido_pdf = respuesta_pdf.content

        if not contenido_pdf.startswith(b"%PDF"):
            raise HTTPException(
                status_code=500,
                detail="El servicio de tickets no devolvió un PDF válido."
            )

    except requests.RequestException as error:
        print("Error conectando con tickets:", error)

        raise HTTPException(
            status_code=503,
            detail="No fue posible conectar con el servicio de tickets."
        )

    # Preparar correo
    mensaje = EmailMessage()

    mensaje["Subject"] = f"CUBEX - Comprobante de compra #{id_pedido}"
    mensaje["From"] = settings.SMTP_USER
    mensaje["To"] = correo_cliente

    mensaje.set_content(
        f"""
Hola, {nombre_cliente}.

¡Gracias por comprar en CUBEX!

Tu pago del pedido #{id_pedido} ha sido confirmado.

Adjuntamos tu comprobante de compra en formato PDF.

Conserva este documento para cualquier aclaración.

¡Gracias por tu preferencia!

Equipo CUBEX
Gira, piensa y conquista.
"""
    )

    mensaje.add_attachment(
        contenido_pdf,
        maintype="application",
        subtype="pdf",
        filename=f"CUBEX-ticket-{id_pedido}.pdf"
    )

    # Enviar correo
    try:
        with smtplib.SMTP_SSL(
            settings.SMTP_HOST,
            settings.SMTP_PORT,
            timeout=30
        ) as servidor:

            servidor.login(
                settings.SMTP_USER,
                settings.SMTP_PASSWORD
            )

            servidor.send_message(mensaje)

    except Exception as error:
        print("Error enviando correo:", error)

        raise HTTPException(
            status_code=502,
            detail="No fue posible enviar el comprobante por correo."
        )

    return {
        "exitoso": True,
        "mensaje": "Comprobante enviado correctamente.",
        "pedido": id_pedido,
        "correo": correo_cliente
    }