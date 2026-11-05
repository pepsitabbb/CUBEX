
import { Request, Response } from "express";
import { prisma } from "../config/prisma";

import {
    validarCvv,
    validarExpiracion,
    mascararNumero,
    MarcaTarjeta
} from "../utils/tarjeta";

import { autorizarTarjeta } from "../services/pasarelaSimulada";
import { registrarFallo } from "../utils/limiteIntentos";
import { obtenerClienteDeUsuario } from "../utils/cliente";
import { leerTokenTarjeta } from "../utils/tokenTarjeta";

// ---------------------------------------------------------------------
// PEDIDOS PENDIENTES DEL CLIENTE
// Se leen de la tabla pedidos (no del último carrito), con el total que
// calculó el servidor al crear el pedido (incluye ofertas activas).
// ---------------------------------------------------------------------

interface PedidoPendiente {
    id: number;
    fecha: Date | string | null;
    estado: string;
    total: number;
}

interface ArticuloPedido {
    id_pedido: number;
    id_producto: number;
    producto: string;
    cantidad: number;
    precio: number;
}

const PEDIDOS_API_URL = (process.env.PEDIDOS_API_URL || "http://localhost:3011/api/Pedidos")
    .replace(/\/+$/, "");

async function obtenerPedidosPendientes(idCliente: number, idPedido?: number) {
    const filas = await prisma.$queryRaw<
        { id: number; fecha: Date | null; estado: string; total: unknown }[]
    >`
        SELECT p.id, p.fecha, p.estado,
               COALESCE(p.total, (
                   SELECT ROUND(SUM(dc.cantidad * COALESCE(dc.precio_unitario, pr.precio)), 2)
                   FROM detalle_carrito dc
                   INNER JOIN productos pr ON pr.id = dc.id_producto
                   WHERE dc.id_carrito = p.id_carrito
               )) AS total
        FROM pedidos p
        WHERE p.id_cliente = ${idCliente}
          AND LOWER(p.estado) = 'pendiente'
        ORDER BY p.fecha DESC, p.id DESC
        LIMIT 20
    `;

    const pedidos: PedidoPendiente[] = filas
        .map(f => ({
            id: Number(f.id),
            fecha: f.fecha,
            estado: "pendiente",
            total: Math.round(Number(f.total || 0) * 100) / 100
        }))
        .filter(p => !idPedido || p.id === idPedido);

    if (pedidos.length === 0) {
        return { pedidos, articulos: [] as ArticuloPedido[] };
    }

    const articulos = await prisma.$queryRaw<
        { id_pedido: number; id_producto: number; producto: string; cantidad: number; precio: unknown }[]
    >`
        SELECT p.id AS id_pedido, dc.id_producto, pr.nombre AS producto,
               dc.cantidad, COALESCE(dc.precio_unitario, pr.precio) AS precio
        FROM pedidos p
        INNER JOIN detalle_carrito dc ON dc.id_carrito = p.id_carrito
        INNER JOIN productos pr ON pr.id = dc.id_producto
        WHERE p.id_cliente = ${idCliente}
          AND LOWER(p.estado) = 'pendiente'
    `;

    return {
        pedidos,
        articulos: articulos.map(a => ({
            id_pedido: Number(a.id_pedido),
            id_producto: Number(a.id_producto),
            producto: a.producto,
            cantidad: Number(a.cantidad),
            precio: Number(a.precio)
        }))
    };
}

// Pide al microservicio de pedidos que confirme el pago. Allí se
// descuenta el inventario una sola vez (operación idempotente).
async function confirmarPedido(idPedido: number, referencia: string) {
    try {
        const respuesta = await fetch(`${PEDIDOS_API_URL}/${idPedido}/confirmar-pago`, {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                "X-Servicio-Clave": String(process.env.CUBEX_SERVICE_KEY || "").trim()
            },
            body: JSON.stringify({ referencia_pago: referencia })
        });

        const datos = await respuesta.json().catch(() => ({})) as Record<string, unknown>;

        return {
            ok: respuesta.ok,
            status: respuesta.status,
            mensaje: String(datos.mensaje || ""),
            codigo: datos.codigo ? String(datos.codigo) : null,
            detalle: datos.detalle || null
        };
    } catch {
        return {
            ok: false,
            status: 503,
            mensaje: "El servicio de pedidos no está disponible.",
            codigo: "PEDIDOS_NO_DISPONIBLE",
            detalle: null
        };
    }
}

// GET /pagos/pedidos-pendientes
export async function pedidosPendientes(
    req: Request,
    res: Response
): Promise<void> {

    const cliente = await obtenerClienteDeUsuario(
        req.usuario!.idUsuario
    );

    if (!cliente) {
        res.status(403).json({
            error: "El usuario no tiene perfil de cliente"
        });
        return;
    }

    const { pedidos, articulos } = await obtenerPedidosPendientes(cliente.id);

    res.status(200).json({
        exito: true,
        mensaje: pedidos.length
            ? "Pedidos pendientes de pago"
            : "No tienes pedidos pendientes de pago",
        pedidos: pedidos.map(p => {
            const propios = articulos.filter(a => a.id_pedido === p.id);

            return {
                ...p,
                monto: p.total,
                articulos: propios.map(a => ({
                    idProducto: a.id_producto,
                    producto: a.producto,
                    cantidad: a.cantidad,
                    precio: a.precio,
                    subtotal: Math.round(a.precio * a.cantidad * 100) / 100
                }))
            };
        })
    });
}

// POST /pagos/verificar-tarjeta
// Autoriza el pago del pedido pendiente seleccionado por el cliente.
export async function verificarTarjetaPago(
    req: Request,
    res: Response
): Promise<void> {

    const idUsuario = req.usuario!.idUsuario;

    const cliente = await obtenerClienteDeUsuario(idUsuario);

    if (!cliente) {
        res.status(403).json({
            error: "El usuario no tiene perfil de cliente"
        });
        return;
    }

    const { idTarjeta, cvv, idPedido } = req.body || {};

    const tarjetaId = Number(idTarjeta);
    const pedidoId = Number(idPedido);

    if (!Number.isInteger(tarjetaId) || tarjetaId <= 0) {
        res.status(400).json({
            error: "idTarjeta es requerido"
        });
        return;
    }

    if (!Number.isInteger(pedidoId) || pedidoId <= 0) {
        res.status(400).json({
            error: "idPedido es requerido"
        });
        return;
    }

    // El pedido debe pertenecer al cliente y seguir pendiente de pago.
    const { pedidos, articulos } = await obtenerPedidosPendientes(cliente.id, pedidoId);

    if (pedidos.length === 0) {
        res.status(409).json({
            aprobado: false,
            codigo: "pedido_no_pendiente",
            error: "El pedido no existe, no es tuyo o ya no está pendiente de pago"
        });
        return;
    }

    // Monto real calculado en el servidor.
    const monto = pedidos[0].total;

    if (monto <= 0) {
        res.status(422).json({
            error: "El monto del pedido no es válido"
        });
        return;
    }

    // Buscar la tarjeta perteneciente al cliente.
    const tarjeta = await prisma.tarjetas.findFirst({
        where: {
            id: tarjetaId,
            id_cliente: cliente.id
        }
    });

    if (!tarjeta) {
        res.status(404).json({
            error: "Tarjeta no encontrada"
        });
        return;
    }

    if (!tarjeta.verificada) {
        res.status(422).json({
            aprobado: false,
            codigo: "tarjeta_no_verificada",
            error: "La tarjeta no ha sido verificada"
        });
        return;
    }

    // Leer los datos protegidos de la tarjeta.
    const meta = leerTokenTarjeta(tarjeta.token_pago);

    if (!meta) {
        res.status(422).json({
            aprobado: false,
            codigo: "token_tarjeta_invalido",
            error: "No se pudieron validar los datos protegidos de la tarjeta. Regístrala nuevamente."
        });
        return;
    }

    // Validar vencimiento.
    if (!validarExpiracion(meta.mes, meta.anio).valida) {
        registrarFallo(idUsuario);

        res.status(422).json({
            aprobado: false,
            codigo: "tarjeta_vencida",
            error: "La tarjeta está vencida"
        });
        return;
    }

    const marca = meta.marca as MarcaTarjeta;

    // Validar CVV.
    if (!validarCvv(cvv, marca)) {
        registrarFallo(idUsuario);

        res.status(422).json({
            aprobado: false,
            codigo: "cvv_invalido",
            error: marca === "AMEX"
                ? "El CVV debe tener 4 dígitos"
                : "El CVV debe tener 3 dígitos"
        });
        return;
    }

    // Autorizar el importe del pedido.
    const respuesta = autorizarTarjeta({
        marca,
        ultimosDigitos: tarjeta.ultimos_digitos || "",
        monto,
        contexto: "pago"
    });

    if (!respuesta.aprobada) {
        registrarFallo(idUsuario);

        res.status(402).json({
            aprobado: false,
            codigo: respuesta.codigo,
            error: respuesta.mensaje
        });
        return;
    }

    // Confirmar el pedido: aquí se descuenta el inventario.
    const confirmacion = await confirmarPedido(
        pedidoId,
        `TARJETA-${respuesta.codigoAutorizacion || Date.now()}`
    );

    if (!confirmacion.ok) {
        // La autorización se anula (simulado): no hay cargo definitivo.
        res.status(confirmacion.status === 409 ? 409 : 502).json({
            aprobado: false,
            codigo: confirmacion.codigo || "pedido_no_confirmado",
            error: `${confirmacion.mensaje || "No se pudo confirmar el pedido."} La autorización fue anulada.`,
            detalle: confirmacion.detalle
        });
        return;
    }

    // Respuesta exitosa.
    res.status(200).json({
        aprobado: true,
        pedidoConfirmado: true,
        codigo: respuesta.codigo,
        mensaje: respuesta.mensaje,
        codigoAutorizacion: respuesta.codigoAutorizacion,

        tarjeta: {
            id: tarjeta.id,
            marca,
            mascara: mascararNumero(
                marca,
                tarjeta.ultimos_digitos || ""
            )
        },

        idPedido: pedidoId,
        monto,
        articulos: articulos.map(a => ({
            producto: a.producto,
            cantidad: a.cantidad
        }))
    });
}
