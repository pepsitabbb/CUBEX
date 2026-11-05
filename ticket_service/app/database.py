
from sqlalchemy import create_engine, text
from app.config import settings

if not settings.DATABASE_URL:
    raise RuntimeError(
        "Falta configurar DATABASE_URL en el archivo .env"
    )

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600
)


def obtener_pedido_completo(id_pedido: int):
    """
    Obtiene los datos del pedido, cliente y productos
    asociados al carrito.
    """

    with engine.connect() as conn:

        # Consultar pedido y datos del cliente
        pedido = conn.execute(
            text("""
                SELECT
                    p.id,
                    p.id_cliente,
                    p.id_carrito,
                    p.fecha,
                    p.estado,
                    c.id_usuario,

                    COALESCE(
                        NULLIF(TRIM(u.nombre_completo), ''),
                        NULLIF(TRIM(u.nombre_usuario), ''),
                        CONCAT('Cliente #', c.id)
                    ) AS cliente_nombre,

                    u.email AS cliente_correo

                FROM pedidos p

                INNER JOIN clientes c
                    ON c.id = p.id_cliente

                LEFT JOIN usuarios u
                    ON u.id = c.id_usuario

                WHERE p.id = :id
                LIMIT 1
            """),
            {"id": id_pedido}
        ).mappings().first()

        if not pedido:
            return None, []

        # Consultar productos asociados al carrito
        detalles = conn.execute(
            text("""
                SELECT
                    dc.id,
                    dc.cantidad,
                    pr.id AS id_producto,
                    pr.nombre AS producto,
                    COALESCE(dc.precio_unitario, pr.precio) AS precio_unitario

                FROM detalle_carrito dc

                INNER JOIN productos pr
                    ON pr.id = dc.id_producto

                WHERE dc.id_carrito = :id_carrito

                ORDER BY dc.id
            """),
            {"id_carrito": pedido["id_carrito"]}
        ).mappings().all()

        return (
            dict(pedido),
            [dict(item) for item in detalles]
        )
