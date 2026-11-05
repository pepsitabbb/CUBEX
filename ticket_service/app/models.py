import datetime
from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.database import Base

class Usuario(Base):
    __tablename__ = "USUARIOS"
    id = Column(Integer, primary_key=True, index=True) #
    nombre = Column(String(100), nullable=False) #
    correo = Column(String(100), nullable=False)  

class Cliente(Base):
    __tablename__ = "CLIENTES"
    id = Column(Integer, primary_key=True, index=True)  
    id_usuario = Column(Integer, ForeignKey("USUARIOS.id"))  
    rfc = Column(String(20), nullable=True)  
    usuario = relationship("Usuario")

class Producto(Base):
    __tablename__ = "PRODUCTOS"
    id = Column(Integer, primary_key=True, index=True)  
    nombre = Column(String(150), nullable=False)  

class Venta(Base):
    __tablename__ = "VENTAS"
    id = Column(Integer, primary_key=True, index=True)  
    id_pedido = Column(Integer, nullable=False)  
    id_cliente = Column(Integer, ForeignKey("CLIENTES.id"))  
    fecha = Column(DateTime, default=datetime.datetime.utcnow)  
    total = Column(Numeric(10, 2), nullable=False)  
    cliente = relationship("Cliente")
    detalles = relationship("DetalleVenta", back_populates="venta")

class DetalleVenta(Base):
    __tablename__ = "DETALLE_VENTAS"
    id = Column(Integer, primary_key=True, index=True)  
    id_venta = Column(Integer, ForeignKey("VENTAS.id"))  
    id_producto = Column(Integer, ForeignKey("PRODUCTOS.id"))  
    cantidad = Column(Integer, nullable=False)  
    precio_unitario = Column(Numeric(10, 2), nullable=False)  
    venta = relationship("Venta", back_populates="detalles")
    producto = relationship("Producto")

class Comprobante(Base):
    __tablename__ = "COMPROBANTES"
    id = Column(Integer, primary_key=True, index=True)  
    id_venta = Column(Integer, ForeignKey("VENTAS.id"))  
    folio = Column(String(50), unique=True, index=True, nullable=False)  
    fecha_emision = Column(DateTime, default=datetime.datetime.utcnow)  
    enviado_correo = Column(Boolean, default=False)  