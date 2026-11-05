/* =====================================================================
   Cliente HTTP del microservicio de inventario (puerto 3005).
   El servicio de pedidos NUNCA modifica la tabla stock directamente:
   solicita al inventario (fuente confiable de existencias) que aplique
   la salida por venta o el reintegro por cancelación.
   ===================================================================== */

const { leerVariable } = require('../config/seguridad');

function urlInventario() {
    return (leerVariable('INVENTARIO_API_URL') || 'http://localhost:3005/api/inventario')
        .replace(/\/+$/, '');
}

class ErrorInventarioRemoto extends Error {
    constructor(status, codigo, mensaje, detalle = null) {
        super(mensaje);
        this.status = status;
        this.codigo = codigo;
        this.detalle = detalle;
    }
}

async function llamar(ruta, cuerpo) {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), 15000);

    let respuesta;

    try {
        respuesta = await fetch(`${urlInventario()}${ruta}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Servicio-Clave': leerVariable('CUBEX_SERVICE_KEY')
            },
            body: JSON.stringify(cuerpo),
            signal: controlador.signal
        });
    } catch (error) {
        throw new ErrorInventarioRemoto(
            503,
            'INVENTARIO_NO_DISPONIBLE',
            'El servicio de inventario no está disponible. Intenta nuevamente en unos momentos.'
        );
    } finally {
        clearTimeout(temporizador);
    }

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
        throw new ErrorInventarioRemoto(
            respuesta.status === 409 ? 409 : (respuesta.status >= 500 ? 503 : respuesta.status),
            datos.codigo || 'ERROR_INVENTARIO',
            datos.mensaje || datos.message || 'El inventario rechazó la operación.',
            datos.detalle || null
        );
    }

    return datos.datos || datos.data || datos;
}

function descontarVenta(idPedido, articulos, idUsuario = null) {
    return llamar('/ventas/salida', {
        id_pedido: idPedido,
        articulos,
        id_usuario: idUsuario,
        origen: 'registro-pedidos-service'
    });
}

function reintegrarCancelacion(idPedido, motivo, idUsuario = null) {
    return llamar('/ventas/cancelacion', {
        id_pedido: idPedido,
        motivo,
        id_usuario: idUsuario,
        origen: 'registro-pedidos-service'
    });
}

module.exports = {
    ErrorInventarioRemoto,
    descontarVenta,
    reintegrarCancelacion
};
