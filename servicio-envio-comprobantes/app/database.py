from sqlalchemy import create_engine, text
from app.config import settings

if not settings.DATABASE_URL:
    raise RuntimeError("Falta configurar DATABASE_URL en .env")

engine = create_engine(
    settings.DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600
)


def obtener_datos_cliente(id_pedido):

    with engine.connect() as conn:

        pedido = conn.execute(
            text("""
                SELECT
                    p.id,
                    p.estado,
                    c.id AS id_cliente,
                    u.nombre_completo,
                    u.nombre_usuario,
                    u.email AS correo

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
            return None

        return dict(pedido)