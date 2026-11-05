document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // 1. VALIDAR SESIÓN Y ROL
    // =========================================

    const token = sessionStorage.getItem("cubex_token");
    const usuarioGuardado = sessionStorage.getItem("cubex_usuario");

    const tabla = document.getElementById("tablaPedidos");
    const mensaje = document.getElementById("mensajePedidos");

    if (!token || !usuarioGuardado) {
        mostrarMensaje("Tu sesión no está activa. Inicia sesión nuevamente.", "error");
        return;
    }

    let usuario;

    try {
        usuario = JSON.parse(usuarioGuardado);
    } catch (error) {
        mostrarMensaje("No fue posible validar la sesión. Vuelve a iniciar sesión.", "error");
        return;
    }

    if (!usuario || usuario.rol !== "ADMIN") {
        mostrarMensaje("No tienes permisos para administrar los pedidos.", "error");
        return;
    }

    // =========================================
    // 2. CONFIGURACIÓN
    // =========================================

    const API_PEDIDOS = CUBEX_CONFIG.API.PEDIDOS;

    let listaPedidos = [];

    const busqueda = document.getElementById("buscarPedido");
    const filtroEstado = document.getElementById("filtroEstado");

    const modal = document.getElementById("modalPedido");
    const contenidoDetalle = document.getElementById("contenidoDetallePedido");

    // =========================================
    // 3. FUNCIONES AUXILIARES
    // =========================================

    function escaparHTML(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[caracter]);
    }

    function normalizarEstado(estado) {
        return String(estado ?? "").trim().toLowerCase();
    }

    function mostrarMensaje(texto, tipo = "exito") {

        if (!mensaje) return;

        mensaje.textContent = texto;
        mensaje.className = `pedidos-mensaje ${tipo}`;
    }

    function ocultarMensaje() {

        if (!mensaje) return;

        mensaje.textContent = "";
        mensaje.className = "pedidos-mensaje";
    }

    // =========================================
    // 4. ACTUALIZAR ESTADÍSTICAS
    // =========================================

    function actualizarEstadisticas() {

        const total = listaPedidos.length;

        const pendientes = listaPedidos.filter(
            pedido => normalizarEstado(pedido.estado) === "pendiente"
        ).length;

        const confirmados = listaPedidos.filter(
            pedido => normalizarEstado(pedido.estado) === "confirmado"
        ).length;

        const elementoTotal = document.getElementById("totalPedidos");
        const elementoPendientes = document.getElementById("pedidosPendientes");
        const elementoConfirmados = document.getElementById("pedidosConfirmados");

        if (elementoTotal) {
            elementoTotal.textContent = total;
        }

        if (elementoPendientes) {
            elementoPendientes.textContent = pendientes;
        }

        if (elementoConfirmados) {
            elementoConfirmados.textContent = confirmados;
        }
    }

    // =========================================
    // 5. CARGAR PEDIDOS DESDE LA API
    // =========================================

    async function cargarPedidos() {

        if (!tabla) return;

        tabla.innerHTML = `
            <tr>
                <td colspan="5" class="pedidos-vacio">
                    Cargando pedidos...
                </td>
            </tr>
        `;

        ocultarMensaje();

        try {

            const respuesta = await fetch(API_PEDIDOS, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!respuesta.ok) {
                throw new Error(
                    `No se pudieron consultar los pedidos (HTTP ${respuesta.status}).`
                );
            }

            const resultado = await respuesta.json();

            if (resultado?.exitoso === false) {
                throw new Error(
                    resultado.mensaje || "Error al cargar pedidos."
                );
            }

            const datos = Array.isArray(resultado)
                ? resultado
                : resultado?.datos;

            listaPedidos = Array.isArray(datos) ? datos : [];

            actualizarEstadisticas();

            mostrarPedidos();

        } catch (error) {

            console.error("Error al cargar pedidos:", error);

            tabla.innerHTML = `
                <tr>
                    <td colspan="5" class="pedidos-vacio">
                        No fue posible cargar los pedidos.
                    </td>
                </tr>
            `;

            mostrarMensaje(
                `${error.message} Verifica que el microservicio de pedidos esté iniciado.`,
                "error"
            );
        }
    }

    // =========================================
    // 6. MOSTRAR Y FILTRAR PEDIDOS
    // =========================================

    function mostrarPedidos() {

        if (!tabla) return;

        const texto = (busqueda?.value || "")
            .trim()
            .toLowerCase();

        const estadoElegido = filtroEstado?.value || "";

        const filtrados = listaPedidos.filter(pedido => {

            const id = String(pedido.id ?? "");
            const cliente = `${pedido.id_cliente ?? ""} ${pedido.cliente_nombre ?? ""} ${pedido.cliente_correo ?? ""}`;

            const coincideTexto =
                id.toLowerCase().includes(texto) ||
                cliente.toLowerCase().includes(texto);

            const coincideEstado =
                !estadoElegido ||
                normalizarEstado(pedido.estado) === normalizarEstado(estadoElegido);

            return coincideTexto && coincideEstado;
        });

        if (filtrados.length === 0) {

            tabla.innerHTML = `
                <tr>
                    <td colspan="5" class="pedidos-vacio">
                        📦<br>
                        <strong>No hay pedidos para mostrar</strong>
                        <br>
                        No se encontraron pedidos con esos criterios.
                    </td>
                </tr>
            `;

            return;
        }

        tabla.innerHTML = filtrados.map(pedido => {

            const estado = String(pedido.estado || "Pendiente");

            const fecha = pedido.fecha
                ? new Date(pedido.fecha).toLocaleDateString("es-MX")
                : "No disponible";

            const id = escaparHTML(pedido.id);
            const cliente = escaparHTML(pedido.cliente_nombre || `Cliente #${pedido.id_cliente ?? "N/D"}`);
            const actual = normalizarEstado(estado);

            // Transiciones permitidas por el servidor:
            // pendiente -> confirmado | cancelado; confirmado -> cancelado.
            const permitido = opcion => {
                const destino = normalizarEstado(opcion);
                if (destino === actual) return true;
                if (actual === "pendiente") return destino !== "pendiente";
                if (actual === "confirmado") return destino === "cancelado";
                return false;
            };

            const opciones = [
                "Pendiente",
                "Confirmado",
                "Cancelado"
            ].map(opcion => `
                <option
                    value="${opcion}"
                    ${actual === normalizarEstado(opcion) ? "selected" : ""}
                    ${permitido(opcion) ? "" : "disabled"}>
                    ${opcion}
                </option>
            `).join("") + (actual === "procesando" ? '<option selected disabled>Procesando pago</option>' : "");

            return `
                <tr>

                    <td>#${id}</td>

                    <td>
                        ${cliente}
                        <br><small>${escaparHTML(pedido.total_articulos ?? 0)} artículo(s) · ${Number(pedido.total ?? 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</small>
                    </td>

                    <td>${escaparHTML(fecha)}</td>

                    <td>
                        <select
                            class="pedido-estado-select"
                            data-id="${id}"
                            aria-label="Cambiar estado del pedido ${id}"
                            ${["cancelado", "procesando"].includes(actual) ? "disabled" : ""}>

                            ${opciones}

                        </select>
                    </td>

                    <td>
                        <div class="pedido-acciones">

                            <button
                                type="button"
                                class="pedido-boton boton-ver-pedido"
                                data-id="${id}">

                                Ver detalles

                            </button>

                        </div>
                    </td>

                </tr>
            `;

        }).join("");
    }

    // =========================================
    // 7. CONSULTAR DETALLES DEL PEDIDO
    // =========================================

    async function verDetallePedido(id) {

        try {

            const respuesta = await fetch(
                `${API_PEDIDOS}/${encodeURIComponent(id)}`,
                {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );

            if (!respuesta.ok) {
                throw new Error("No se pudo consultar el pedido.");
            }

            const resultado = await respuesta.json();

            const pedido = resultado?.datos || resultado;

            const moneda = valor => Number(valor ?? 0).toLocaleString("es-MX", {
                style: "currency",
                currency: "MXN"
            });

            const direccion = [pedido.calle_numero, pedido.colonia, pedido.ciudad, pedido.codigo_postal]
                .filter(Boolean)
                .join(", ");

            const campos = [
                ["Número de pedido", `#${pedido.id}`],
                ["Cliente", pedido.cliente_nombre || `#${pedido.id_cliente}`],
                ["Correo", pedido.cliente_correo],
                ["Dirección de entrega", direccion],
                ["Fecha", pedido.fecha ? new Date(pedido.fecha).toLocaleString("es-MX") : null],
                ["Estado", pedido.estado],
                ["Total", moneda(pedido.total)],
                ["Venta", pedido.id_venta ? `#${pedido.id_venta}` : "Sin venta (no pagado)"],
                ["Motivo de cancelación", pedido.motivo_cancelacion]
            ].filter(([, valor]) => valor !== null && valor !== undefined && valor !== "");

            const productos = Array.isArray(pedido.productos) ? pedido.productos : [];

            contenidoDetalle.innerHTML = campos.map(([etiqueta, valor]) => `
                <div class="pedido-detalle">

                    <span>${escaparHTML(etiqueta)}</span>

                    <strong>
                        ${escaparHTML(valor ?? "No disponible")}
                    </strong>

                </div>
            `).join("") + (productos.length ? `
                <div class="pedido-detalle">
                    <span>Productos</span>
                    <strong>
                        ${productos.map(p => `${escaparHTML(p.nombre)} × ${Number(p.cantidad)} (${moneda(p.precio_unitario)})`).join("<br>")}
                    </strong>
                </div>` : "");

            modal?.classList.add("mostrar");
            modal?.setAttribute("aria-hidden", "false");

        } catch (error) {

            console.error("Error al consultar detalle:", error);

            mostrarMensaje(
                error.message || "No fue posible consultar el detalle.",
                "error"
            );
        }
    }

    // =========================================
    // 8. CAMBIAR ESTADO DEL PEDIDO
    // =========================================

    async function cambiarEstadoPedido(id, nuevoEstado, selector) {

        const estadosPermitidos = [
            "Pendiente",
            "Confirmado",
            "Cancelado"
        ];

        if (!estadosPermitidos.includes(nuevoEstado)) {

            mostrarMensaje(
                "El estado seleccionado no es válido.",
                "error"
            );

            await cargarPedidos();

            return;
        }

        const avisos = {
            Confirmado: "Se descontará el inventario de los productos del pedido.",
            Cancelado: "Si el pedido ya estaba pagado, las existencias vendidas regresarán al inventario."
        };

        const confirmar = window.Cubex
            ? await Cubex.confirmar({
                titulo: `¿Cambiar el pedido #${id} a "${nuevoEstado}"?`,
                mensaje: avisos[nuevoEstado] || "",
                textoConfirmar: "Sí, cambiar",
                peligro: nuevoEstado === "Cancelado"
            })
            : confirm(`¿Deseas cambiar el estado del pedido #${id} a "${nuevoEstado}"?`);

        if (!confirmar) {

            await cargarPedidos();

            return;
        }

        if (selector) {
            selector.disabled = true;
        }

        try {

            const respuesta = await fetch(
                `${API_PEDIDOS}/${encodeURIComponent(id)}/estado`,
                {
                    method: "PATCH",

                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },

                    body: JSON.stringify({
                        estado: nuevoEstado
                    })
                }
            );

            let resultado = {};

            try {
                resultado = await respuesta.json();
            } catch (error) {
                resultado = {};
            }

            if (!respuesta.ok || resultado?.exitoso === false) {

                throw new Error(
                    resultado?.mensaje ||
                    `No se pudo actualizar el estado (HTTP ${respuesta.status}).`
                );
            }

            mostrarMensaje(
                resultado?.mensaje || "Estado del pedido actualizado correctamente.",
                "exito"
            );

            await cargarPedidos();

        } catch (error) {

            console.error("Error al cambiar estado:", error);

            mostrarMensaje(
                error.message || "Error al actualizar el pedido.",
                "error"
            );

            await cargarPedidos();
        }
    }

    // =========================================
    // 9. CERRAR MODAL DE DETALLES
    // =========================================

    window.cerrarDetallePedido = function () {

        modal?.classList.remove("mostrar");

        modal?.setAttribute("aria-hidden", "true");
    };

    // =========================================
    // 10. EVENTOS DE BÚSQUEDA Y FILTRO
    // =========================================

    busqueda?.addEventListener("input", mostrarPedidos);

    filtroEstado?.addEventListener("change", mostrarPedidos);

    // =========================================
    // 11. EVENTOS DE LA TABLA
    // =========================================

    tabla?.addEventListener("click", evento => {

        const boton = evento.target.closest(".boton-ver-pedido");

        if (boton) {
            verDetallePedido(boton.dataset.id);
        }
    });

    tabla?.addEventListener("change", evento => {

        const selector = evento.target.closest(".pedido-estado-select");

        if (selector) {

            cambiarEstadoPedido(
                selector.dataset.id,
                selector.value,
                selector
            );
        }
    });

    // =========================================
    // 12. EVENTOS DEL MODAL
    // =========================================

    modal?.addEventListener("click", evento => {

        if (evento.target === modal) {
            window.cerrarDetallePedido();
        }
    });

    document.addEventListener("keydown", evento => {

        if (evento.key === "Escape") {
            window.cerrarDetallePedido();
        }
    });

    // =========================================
    // 13. INICIAR CARGA
    // =========================================

    cargarPedidos();

});