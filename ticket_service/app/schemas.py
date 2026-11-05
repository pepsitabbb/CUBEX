import datetime
from pydantic import BaseModel

class TicketResponse(BaseModel):
    id: int
    id_venta: int
    folio: str
    fecha_emision: datetime.datetime
    enviado_correo: bool

    class Config:
        from_attributes = True