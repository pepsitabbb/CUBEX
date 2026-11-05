
document.addEventListener("DOMContentLoaded", () => {

    // =========================================
    // 1. VALIDAR SESIÓN Y ROL
    // =========================================

    const token = sessionStorage.getItem("cubex_token");
    const usuarioGuardado = sessionStorage.getItem("cubex_usuario");

    if (!token || !usuarioGuardado) {
        window.location.replace("login.html");
        return;
    }

    let usuario;

    try {
        usuario = JSON.parse(usuarioGuardado);
    } catch (error) {
        sessionStorage.removeItem("cubex_token");
        sessionStorage.removeItem("cubex_usuario");
        window.location.replace("login.html");
        return;
    }

    if (!usuario || usuario.rol !== "VENDEDOR") {
        if (usuario?.rol === "ADMIN") {
            window.location.replace("admin.html");
        } else {
            window.location.replace("index.html");
        }
        return;
    }


    // =========================================
    // 2. DATOS DEL EMPLEADO
    // =========================================

    const nombreCompleto =
        usuario.nombreCompleto ||
        usuario.nombreUsuario ||
        "Empleado";

    const nombreUsuario = usuario.nombreUsuario || "empleado";
    const correo = usuario.email || usuario.correo || "No disponible";
    const rol = usuario.rol || "VENDEDOR";

    const inicial = nombreCompleto.trim().charAt(0).toUpperCase();

    function colocarTexto(id, texto) {
        const elemento = document.getElementById(id);

        if (elemento) {
            elemento.textContent = texto;
        }
    }

    // Barra lateral
    colocarTexto("nombreEmpleado", "@" + nombreUsuario);
    colocarTexto("inicialEmpleado", inicial);

    // Modal de perfil
    colocarTexto("inicialModal", inicial);
    colocarTexto("modalNombre", nombreCompleto);
    colocarTexto("modalNombreCompleto", nombreCompleto);
    colocarTexto("modalUsuario", "@" + nombreUsuario);
    colocarTexto("modalCorreo", correo);
    colocarTexto("modalRol", rol);

    // Perfil adicional
    colocarTexto("inicialPerfil", inicial);
    colocarTexto("perfilNombre", nombreCompleto);
    colocarTexto("perfilNombreCompleto", nombreCompleto);
    colocarTexto("perfilCorreo", correo);
    colocarTexto("perfilRol", rol);


    // =========================================
    // 3. NOTIFICACIONES
    // =========================================

    function notificar(mensaje, tipo = "exito") {

        const contenedor = document.getElementById(
            "contenedorNotificaciones"
        );

        if (!contenedor) {
            console.log(mensaje);
            return;
        }

        const notificacion = document.createElement("div");

        notificacion.className = `notificacion ${tipo}`;
        notificacion.textContent = mensaje;

        contenedor.appendChild(notificacion);

        setTimeout(() => {

            notificacion.classList.add("ocultar");

            setTimeout(() => {
                notificacion.remove();
            }, 300);

        }, 2500);
    }


    // =========================================
    // 4. MODAL DE PERFIL
    // =========================================

    const modalPerfil = document.getElementById("modalPerfil");

    function abrirModalPerfil() {

        if (!modalPerfil) {
            console.error("No se encontró el modal #modalPerfil.");
            return;
        }

        modalPerfil.classList.add("mostrar");
        modalPerfil.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";
    }

    function cerrarModalPerfil() {

        if (!modalPerfil) return;

        modalPerfil.classList.remove("mostrar");
        modalPerfil.setAttribute("aria-hidden", "true");

        document.body.style.overflow = "";
    }

    document.getElementById("abrirPerfil")
        ?.addEventListener("click", function (evento) {

            evento.preventDefault();
            abrirModalPerfil();

        });

    document.getElementById("abrirPerfilTarjeta")
        ?.addEventListener("click", function (evento) {

            evento.preventDefault();
            abrirModalPerfil();

        });


    // =========================================
    // 5. CERRAR MODAL DE PERFIL
    // =========================================

    const botonX = document.querySelector(
        "#cerrarModal, #cerrarModalPerfil"
    );

    const botonCerrarPerfil = document.querySelector(
        "#botonCerrarModal, #botonCerrarPerfil"
    );

    if (botonX) {
        botonX.type = "button";
    }

    if (botonCerrarPerfil) {
        botonCerrarPerfil.type = "button";
    }

    document.addEventListener("click", function (evento) {

        const clicEnX = evento.target.closest(
            "#cerrarModal, #cerrarModalPerfil"
        );

        const clicEnCerrar = evento.target.closest(
            "#botonCerrarModal, #botonCerrarPerfil"
        );

        if (clicEnX || clicEnCerrar) {

            evento.preventDefault();
            evento.stopPropagation();

            cerrarModalPerfil();
        }

    }, true);

    modalPerfil?.addEventListener("click", function (evento) {

        if (evento.target === modalPerfil) {
            cerrarModalPerfil();
        }

    });


    // =========================================
    // 6. MODAL DE CERRAR SESIÓN
    // =========================================

    const modalCerrarSesion = document.getElementById(
        "modalCerrarSesion"
    );

    const botonCerrarSesion = document.getElementById(
        "cerrarSesion"
    );

    const cancelarCerrarSesion = document.getElementById(
        "cancelarCerrarSesion"
    );

    const confirmarCerrarSesion = document.getElementById(
        "confirmarCerrarSesion"
    );

    function abrirModalCerrarSesion() {

        if (!modalCerrarSesion) return;

        modalCerrarSesion.classList.add("mostrar");
        modalCerrarSesion.setAttribute("aria-hidden", "false");

        document.body.style.overflow = "hidden";
    }

    function cerrarModalCerrarSesion() {

        if (!modalCerrarSesion) return;

        modalCerrarSesion.classList.remove("mostrar");
        modalCerrarSesion.setAttribute("aria-hidden", "true");

        document.body.style.overflow = "";
    }

    botonCerrarSesion?.addEventListener("click", function (evento) {

        evento.preventDefault();
        abrirModalCerrarSesion();

    });

    cancelarCerrarSesion?.addEventListener("click", function () {

        cerrarModalCerrarSesion();

    });

    confirmarCerrarSesion?.addEventListener("click", function () {

        sessionStorage.removeItem("cubex_token");
        sessionStorage.removeItem("cubex_usuario");

        cerrarModalCerrarSesion();

        window.location.replace("login.html");

    });

    modalCerrarSesion?.addEventListener("click", function (evento) {

        if (evento.target === modalCerrarSesion) {
            cerrarModalCerrarSesion();
        }

    });


    // =========================================
    // 7. NAVEGACIÓN Y SECCIÓN ACTIVA
    // =========================================

    const enlaces = document.querySelectorAll(
        ".navegacion .enlace-menu"
    );

    function actualizarMenuActivo() {

        const seccion =
            window.location.hash.replace("#", "") || "resumen";

        enlaces.forEach(enlace => {

            const destino = enlace.dataset.seccion;

            enlace.classList.toggle(
                "activo",
                destino === seccion
            );

        });
    }

    enlaces.forEach(enlace => {

        enlace.addEventListener("click", function () {

            const destino = this.dataset.seccion;

            if (destino) {

                enlaces.forEach(item => {
                    item.classList.remove("activo");
                });

                this.classList.add("activo");
            }

        });

    });

    // Accesos desde las tarjetas del resumen
    document.querySelectorAll(".funcion[href^='#']").forEach(enlace => {

        enlace.addEventListener("click", function () {

            const destino = this.getAttribute("href").substring(1);

            const enlaceMenu = document.querySelector(
                `.enlace-menu[data-seccion="${destino}"]`
            );

            if (enlaceMenu) {

                enlaces.forEach(item => {
                    item.classList.remove("activo");
                });

                enlaceMenu.classList.add("activo");
            }

        });

    });

    window.addEventListener("hashchange", actualizarMenuActivo);

    actualizarMenuActivo();


    // =========================================
    // 8. CERRAR MODALES CON ESCAPE
    // =========================================

    document.addEventListener("keydown", function (evento) {

        if (evento.key === "Escape") {

            cerrarModalPerfil();
            cerrarModalCerrarSesion();

        }

    });


    // =========================================
    // 9. GESTIÓN DE PEDIDOS
    // =========================================

    const API_PEDIDOS_EMPLEADO = CUBEX_CONFIG.API.PEDIDOS;

    let listaPedidosEmpleado = [];

    const tablaPedidosEmpleado = document.getElementById(
        "tablaPedidosEmpleado"
    );

    const buscarPedidoEmpleado = document.getElementById(
        "buscarPedidoEmpleado"
    );

    const filtroEstadoEmpleado = document.getElementById(
        "filtroEstadoEmpleado"
    );

    const mensajePedidosEmpleado = document.getElementById(
        "mensajePedidosEmpleado"
    );

    const actualizarPedidosEmpleado = document.getElementById(
        "actualizarPedidos"
    );


    // -----------------------------------------
    // NORMALIZAR ESTADOS
    // -----------------------------------------

    function normalizarEstado(estado) {

        const valor = String(estado || "")
            .trim()
            .toLowerCase();

        if (valor === "pendiente") return "Pendiente";
        if (valor === "confirmado") return "Confirmado";
        if (valor === "cancelado") return "Cancelado";

        return estado || "Sin estado";
    }


    // -----------------------------------------
    // CARGAR PEDIDOS
    // -----------------------------------------

    async function cargarPedidosEmpleado() {

        if (!tablaPedidosEmpleado) {
            console.error("No se encontró #tablaPedidosEmpleado.");
            return;
        }

        tablaPedidosEmpleado.innerHTML = `
            <tr>
                <td colspan="5" class="tabla-vacia">
                    Cargando pedidos...
                </td>
            </tr>
        `;

        if (mensajePedidosEmpleado) {
            mensajePedidosEmpleado.textContent = "";
        }

        try {

            // Consulta igual que la prueba que respondió HTTP 200
            const respuesta = await fetch(API_PEDIDOS_EMPLEADO);

            if (!respuesta.ok) {
                throw new Error(
                    `Error HTTP ${respuesta.status} al consultar pedidos.`
                );
            }

            const resultado = await respuesta.json();

            console.log("Respuesta del servicio de pedidos:", resultado);

            if (resultado.exitoso === false) {
                throw new Error(
                    resultado.mensaje || "Error al cargar pedidos."
                );
            }

            // El servicio devuelve:
            // { exitoso: true, total: 18, datos: [...] }

            if (Array.isArray(resultado)) {

                listaPedidosEmpleado = resultado;

            } else if (Array.isArray(resultado.datos)) {

                listaPedidosEmpleado = resultado.datos;

            } else {

                listaPedidosEmpleado = [];

            }

            console.log(
                "Pedidos cargados:",
                listaPedidosEmpleado.length
            );

            mostrarPedidosEmpleado();

        } catch (error) {

            console.error("Error al cargar pedidos:", error);

            tablaPedidosEmpleado.innerHTML = `
                <tr>
                    <td colspan="5" class="tabla-vacia">
                        No fue posible cargar los pedidos.
                    </td>
                </tr>
            `;

            if (mensajePedidosEmpleado) {
                mensajePedidosEmpleado.textContent =
                    error.message;
            }

            notificar("Error al consultar los pedidos.", "error");
        }
    }


    // -----------------------------------------
    // MOSTRAR PEDIDOS
    // -----------------------------------------

    function mostrarPedidosEmpleado() {

        if (!tablaPedidosEmpleado) return;

        const busqueda = buscarPedidoEmpleado?.value
            .trim()
            .toLowerCase() || "";

        const estadoSeleccionado = filtroEstadoEmpleado?.value || "";

        const pedidosFiltrados = listaPedidosEmpleado.filter(pedido => {

            const id = String(pedido.id ?? "");
            const cliente = String(pedido.id_cliente ?? "");
            const estado = normalizarEstado(pedido.estado);

            const coincideBusqueda =
                id.toLowerCase().includes(busqueda) ||
                cliente.toLowerCase().includes(busqueda);

            const coincideEstado =
                !estadoSeleccionado ||
                estado === estadoSeleccionado;

            return coincideBusqueda && coincideEstado;

        });

        if (pedidosFiltrados.length === 0) {

            tablaPedidosEmpleado.innerHTML = `
                <tr>
                    <td colspan="5" class="tabla-vacia">
                        <span>📦</span>
                        <strong>No hay pedidos para mostrar</strong>
                        <p>No se encontraron pedidos con esos criterios.</p>
                    </td>
                </tr>
            `;

            return;
        }

        tablaPedidosEmpleado.innerHTML = pedidosFiltrados.map(pedido => {

            const fecha = pedido.fecha
                ? new Date(pedido.fecha).toLocaleDateString("es-MX")
                : "No disponible";

            const estado = normalizarEstado(pedido.estado);

            return `
                <tr>
                    <td>#${pedido.id}</td>

                    <td>Cliente #${pedido.id_cliente ?? "N/D"}</td>

                    <td>${fecha}</td>

                    <td>
                        <select
                            class="selector-estado-pedido"
                            data-id="${pedido.id}"
                            aria-label="Cambiar estado del pedido ${pedido.id}"
                        >
                            <option value="Pendiente"
                                ${estado === "Pendiente" ? "selected" : ""}>
                                Pendiente
                            </option>

                            <option value="Confirmado"
                                ${estado === "Confirmado" ? "selected" : ""}>
                                Confirmado
                            </option>

                            <option value="Cancelado"
                                ${estado === "Cancelado" ? "selected" : ""}>
                                Cancelado
                            </option>
                        </select>
                    </td>

                    <td>
                        <button
                            type="button"
                            class="boton-ver-pedido"
                            data-id="${pedido.id}"
                        >
                            Ver detalles
                        </button>
                    </td>
                </tr>
            `;

        }).join("");

    }


    // -----------------------------------------
    // VER DETALLES DEL PEDIDO
    // -----------------------------------------

    
async function verDetallePedidoEmpleado(id) {

    try {

        const respuesta = await fetch(
            `${API_PEDIDOS_EMPLEADO}/${id}`
        );

        if (!respuesta.ok) {
            throw new Error("No se pudo consultar el pedido.");
        }

        const resultado = await respuesta.json();
        const pedido = resultado.datos || resultado;

        // Crear ventana de detalles
        let modal = document.getElementById("modalDetallePedido");

        if (!modal) {

            modal = document.createElement("div");
            modal.id = "modalDetallePedido";

            modal.innerHTML = `
                <div class="detalle-pedido-contenido">

                    <div class="detalle-pedido-encabezado">
                        <div>
                            <span class="detalle-etiqueta">CUBEX / PEDIDOS</span>
                            <h2>Detalles del pedido</h2>
                            <p id="detalleNumeroPedido"></p>
                        </div>

                        <button
                            type="button"
                            class="cerrar-detalle-pedido"
                            id="cerrarDetallePedido"
                            aria-label="Cerrar"
                        >
                            &times;
                        </button>
                    </div>

                    <div class="detalle-pedido-cuerpo">

                        <div class="detalle-item">
                            <span>Número de pedido</span>
                            <strong id="detalleId"></strong>
                        </div>

                        <div class="detalle-item">
                            <span>Cliente</span>
                            <strong id="detalleCliente"></strong>
                        </div>

                        <div class="detalle-item">
                            <span>Carrito</span>
                            <strong id="detalleCarrito"></strong>
                        </div>

                        <div class="detalle-item">
                            <span>Dirección</span>
                            <strong id="detalleDireccion"></strong>
                        </div>

                        <div class="detalle-item">
                            <span>Tipo de pago</span>
                            <strong id="detallePago"></strong>
                        </div>

                        <div class="detalle-item">
                            <span>Fecha</span>
                            <strong id="detalleFecha"></strong>
                        </div>

                        <div class="detalle-item detalle-estado">
                            <span>Estado del pedido</span>
                            <strong id="detalleEstado"></strong>
                        </div>

                    </div>

                    <div class="detalle-pedido-pie">
                        <button
                            type="button"
                            id="botonCerrarDetalle"
                        >
                            Cerrar
                        </button>
                    </div>

                </div>
            `;

            document.body.appendChild(modal);

            // Cerrar con la X
            modal.querySelector("#cerrarDetallePedido")
                .addEventListener("click", cerrarDetallePedido);

            // Cerrar con el botón
            modal.querySelector("#botonCerrarDetalle")
                .addEventListener("click", cerrarDetallePedido);

            // Cerrar al hacer clic fuera
            modal.addEventListener("click", function(evento) {

                if (evento.target === modal) {
                    cerrarDetallePedido();
                }

            });
        }

        // Colocar información del pedido
        document.getElementById("detalleNumeroPedido").textContent =
            `Información del pedido #${pedido.id}`;

        document.getElementById("detalleId").textContent =
            `#${pedido.id ?? "N/D"}`;

        document.getElementById("detalleCliente").textContent =
            `Cliente #${pedido.id_cliente ?? "N/D"}`;

        document.getElementById("detalleCarrito").textContent =
            pedido.id_carrito ?? "N/D";

        document.getElementById("detalleDireccion").textContent =
            pedido.id_direccion ?? "N/D";

        document.getElementById("detallePago").textContent =
            pedido.id_tipo_pago ?? "N/D";

        document.getElementById("detalleFecha").textContent =
            pedido.fecha
                ? new Date(pedido.fecha).toLocaleString("es-MX")
                : "No disponible";

        document.getElementById("detalleEstado").textContent =
            normalizarEstado(pedido.estado);

        // Mostrar ventana
        modal.classList.add("mostrar-detalle-pedido");
        document.body.style.overflow = "hidden";

    } catch (error) {

        console.error("Error al consultar detalle:", error);

        notificar(
            "No fue posible consultar el detalle del pedido.",
            "error"
        );

    }
}


// Cerrar ventana de detalles
function cerrarDetallePedido() {

    const modal = document.getElementById("modalDetallePedido");

    if (!modal) return;

    modal.classList.remove("mostrar-detalle-pedido");

    document.body.style.overflow = "";
}



    // -----------------------------------------
    // CAMBIAR ESTADO DEL PEDIDO
    // -----------------------------------------

    async function cambiarEstadoPedidoEmpleado(id, nuevoEstado) {

        const estadosPermitidos = [
            "Pendiente",
            "Confirmado",
            "Cancelado"
        ];

        if (!estadosPermitidos.includes(nuevoEstado)) {

            notificar(
                "El estado seleccionado no es válido.",
                "error"
            );

            return;
        }

        const confirmar = confirm(
            `¿Deseas cambiar el estado del pedido #${id} a "${nuevoEstado}"?`
        );

        if (!confirmar) {
            mostrarPedidosEmpleado();
            return;
        }

        try {

            const respuesta = await fetch(
                `${API_PEDIDOS_EMPLEADO}/${id}/estado`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        estado: nuevoEstado
                    })
                }
            );

            const resultado = await respuesta.json();

            if (!respuesta.ok || resultado.exitoso === false) {

                throw new Error(
                    resultado.mensaje ||
                    "No se pudo actualizar el estado."
                );
            }

            notificar(
                "Estado del pedido actualizado correctamente."
            );

            await cargarPedidosEmpleado();

        } catch (error) {

            console.error("Error al cambiar estado:", error);

            notificar(
                error.message || "Error al actualizar el pedido.",
                "error"
            );

            await cargarPedidosEmpleado();
        }
    }


    // -----------------------------------------
    // EVENTOS DE BÚSQUEDA Y FILTRO
    // -----------------------------------------

    buscarPedidoEmpleado?.addEventListener(
        "input",
        mostrarPedidosEmpleado
    );

    filtroEstadoEmpleado?.addEventListener(
        "change",
        mostrarPedidosEmpleado
    );

    actualizarPedidosEmpleado?.addEventListener(
        "click",
        cargarPedidosEmpleado
    );


    // -----------------------------------------
    // EVENTOS DE LA TABLA
    // -----------------------------------------

    tablaPedidosEmpleado?.addEventListener(
        "click",
        function (evento) {

            const boton = evento.target.closest(".boton-ver-pedido");

            if (boton) {
                verDetallePedidoEmpleado(boton.dataset.id);
            }

        }
    );

    tablaPedidosEmpleado?.addEventListener(
        "change",
        function (evento) {

            if (
                evento.target.classList.contains(
                    "selector-estado-pedido"
                )
            ) {

                const id = evento.target.dataset.id;
                const nuevoEstado = evento.target.value;

                cambiarEstadoPedidoEmpleado(id, nuevoEstado);
            }

        }
    );


    // =========================================
    // 10. INICIAR CARGA DE PEDIDOS
    // =========================================

    cargarPedidosEmpleado();

});
