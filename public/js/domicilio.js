
const API_URL = CUBEX_CONFIG.API.DOMICILIOS;
const PEDIDOS_URL = CUBEX_CONFIG.API.PEDIDOS;

let domicilios = [];
let domicilioSeleccionado = sessionStorage.getItem("cubex_domicilio_id");
let domicilioEditando = null;

// ELEMENTOS DEL DOM
const formDomicilio = document.getElementById("formDomicilio");
const listaDomicilios = document.getElementById("listaDomicilios");
const mensaje = document.getElementById("mensaje");

const btnGuardar = document.getElementById("btnGuardar");
const btnCancelar = document.getElementById("btnCancelar");
const btnActualizar = document.getElementById("btnActualizar");

const btnVolverCarrito = document.getElementById("btnVolverCarrito");
const btnContinuarPago = document.getElementById("btnContinuarPago");

const tituloFormulario = document.getElementById("tituloFormulario");

// TOKEN
function obtenerToken() {
    return sessionStorage.getItem("cubex_token") ||
        localStorage.getItem("cubex_token");
}

// USUARIO ACTUAL
function obtenerUsuario() {
    try {
        return JSON.parse(
            sessionStorage.getItem("cubex_usuario") ||
            localStorage.getItem("cubex_usuario") ||
            "{}"
        );
    } catch {
        return {};
    }
}

// MENSAJES
function mostrarMensaje(texto, tipo = "exito") {
    if (!mensaje) return;

    mensaje.textContent = texto;
    mensaje.className = `mensaje ${tipo}`;
    mensaje.style.display = "block";

    setTimeout(() => {
        mensaje.style.display = "none";
    }, 4000);
}

// ESCAPAR HTML
function escaparHTML(texto) {
    return String(texto ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caracter]);
}

// PETICIONES A LOS MICROSERVICIOS
async function solicitarAPI(url, opciones = {}) {
    const token = obtenerToken();

    if (!token) {
        throw new Error(
            "Tu sesión no está activa. Inicia sesión nuevamente."
        );
    }

    const respuesta = await fetch(url, {
        ...opciones,
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`,
            ...opciones.headers
        }
    });

    const datos = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok) {
        const error = new Error(
            datos.mensaje ||
            datos.error ||
            "Ocurrió un error al procesar la solicitud."
        );
        error.status = respuesta.status;
        error.datos = datos;
        throw error;
    }

    return datos;
}

// CARGAR DOMICILIOS
async function cargarDomicilios() {
    listaDomicilios.innerHTML = `
        <div class="estado-cargando">
            <p>Cargando domicilios...</p>
        </div>
    `;

    try {
        const datos = await solicitarAPI(API_URL);

        domicilios = Array.isArray(datos)
            ? datos
            : datos.domicilios || datos.data || [];

        if (
            domicilioSeleccionado &&
            !domicilios.some(
                domicilio =>
                    Number(domicilio.id) === Number(domicilioSeleccionado)
            )
        ) {
            domicilioSeleccionado = null;
            sessionStorage.removeItem("cubex_domicilio_id");
        }

        mostrarDomicilios();

    } catch (error) {
        listaDomicilios.innerHTML = "";
        mostrarMensaje(error.message, "error");
    }
}

// MOSTRAR DOMICILIOS
function mostrarDomicilios() {
    if (domicilios.length === 0) {
        listaDomicilios.innerHTML = `
            <div class="estado-vacio">
                <p>Aún no tienes domicilios registrados.</p>
                <p>Agrega una dirección para continuar con tu compra.</p>
            </div>
        `;
        return;
    }

    listaDomicilios.innerHTML = domicilios.map(domicilio => {
        const seleccionado =
            Number(domicilioSeleccionado) === Number(domicilio.id);

        return `
            <article class="domicilio-card ${seleccionado ? "seleccionado" : ""}">

                <label class="seleccionar-domicilio">
                    <input
                        type="radio"
                        name="domicilioSeleccionado"
                        value="${domicilio.id}"
                        ${seleccionado ? "checked" : ""}
                    >

                    <span class="radio-personalizado"></span>

                    <span class="domicilio-titulo">
                        Domicilio #${escaparHTML(domicilio.id)}
                    </span>
                </label>

                <div class="domicilio-datos">
                    <p>
                        <strong>Dirección:</strong>
                        ${escaparHTML(domicilio.calle_numero)}
                    </p>

                    <p>
                        <strong>Colonia:</strong>
                        ${escaparHTML(domicilio.colonia)}
                    </p>

                    <p>
                        <strong>Ciudad:</strong>
                        ${escaparHTML(domicilio.ciudad)}
                    </p>

                    <p>
                        <strong>Código postal:</strong>
                        ${escaparHTML(domicilio.codigo_postal)}
                    </p>

                    ${
                        domicilio.referencias
                            ? `<p><strong>Referencias:</strong> ${escaparHTML(domicilio.referencias)}</p>`
                            : ""
                    }
                </div>

                <div class="acciones-domicilio">
                    <button
                        type="button"
                        class="btn btn-secondary btn-editar"
                        data-id="${domicilio.id}">
                        Editar
                    </button>

                    <button
                        type="button"
                        class="btn btn-eliminar"
                        data-id="${domicilio.id}">
                        Eliminar
                    </button>
                </div>

            </article>
        `;
    }).join("");
}

// SELECCIONAR DOMICILIO
listaDomicilios.addEventListener("change", event => {
    if (event.target.name === "domicilioSeleccionado") {
        domicilioSeleccionado = event.target.value;

        sessionStorage.setItem(
            "cubex_domicilio_id",
            domicilioSeleccionado
        );

        mostrarDomicilios();
    }
});

// GUARDAR O ACTUALIZAR DOMICILIO
formDomicilio.addEventListener("submit", async event => {
    event.preventDefault();

    const domicilio = {
        calle: document.getElementById("calle").value.trim(),
        numero_casa: document.getElementById("numero_casa").value.trim(),
        colonia: document.getElementById("colonia").value.trim(),
        ciudad: document.getElementById("ciudad").value.trim(),
        codigo_postal: document.getElementById("codigo_postal").value.trim(),
        referencias: document.getElementById("referencias").value.trim()
    };

    if (Object.values(domicilio).slice(0, 5).some(valor => !valor)) {
        mostrarMensaje("Completa todos los campos obligatorios.", "error");
        return;
    }

    try {
        btnGuardar.disabled = true;
        btnGuardar.textContent = "Guardando...";

        if (domicilioEditando) {
            await solicitarAPI(`${API_URL}/${domicilioEditando}`, {
                method: "PUT",
                body: JSON.stringify(domicilio)
            });

            mostrarMensaje("Domicilio actualizado correctamente.");

            domicilioSeleccionado = domicilioEditando;

        } else {
            const respuesta = await solicitarAPI(API_URL, {
                method: "POST",
                body: JSON.stringify(domicilio)
            });

            mostrarMensaje("Domicilio registrado correctamente.");

            const nuevoId =
                respuesta.id ||
                respuesta.domicilio?.id ||
                respuesta.datos?.id;

            if (nuevoId) {
                domicilioSeleccionado = nuevoId;
            }
        }

        if (domicilioSeleccionado) {
            sessionStorage.setItem(
                "cubex_domicilio_id",
                domicilioSeleccionado
            );
        }

        formDomicilio.reset();
        cancelarEdicion();

        await cargarDomicilios();

    } catch (error) {
        mostrarMensaje(error.message, "error");

    } finally {
        btnGuardar.disabled = false;
        btnGuardar.textContent = "Guardar domicilio";
    }
});

// EDITAR O ELIMINAR
listaDomicilios.addEventListener("click", async event => {
    const botonEditar = event.target.closest(".btn-editar");
    const botonEliminar = event.target.closest(".btn-eliminar");

    if (botonEditar) {
        editarDomicilio(botonEditar.dataset.id);
    }

    if (botonEliminar) {
        const id = botonEliminar.dataset.id;

        if (botonEliminar.dataset.confirmar !== "true") {
            botonEliminar.dataset.confirmar = "true";
            botonEliminar.textContent = "¿Confirmar?";
            botonEliminar.classList.add("confirmando");

            setTimeout(() => {
                if (botonEliminar.isConnected) {
                    botonEliminar.dataset.confirmar = "false";
                    botonEliminar.textContent = "Eliminar";
                    botonEliminar.classList.remove("confirmando");
                }
            }, 4000);

            return;
        }

        await eliminarDomicilio(id);
    }
});

// EDITAR DOMICILIO
function editarDomicilio(id) {
    const domicilio = domicilios.find(
        item => Number(item.id) === Number(id)
    );

    if (!domicilio) return;

    const direccion = domicilio.calle_numero || "";
    const ultimaSeparacion = direccion.lastIndexOf(" ");

    document.getElementById("calle").value =
        ultimaSeparacion > 0
            ? direccion.substring(0, ultimaSeparacion)
            : direccion;

    document.getElementById("numero_casa").value =
        ultimaSeparacion > 0
            ? direccion.substring(ultimaSeparacion + 1)
            : "";

    document.getElementById("colonia").value = domicilio.colonia || "";
    document.getElementById("ciudad").value = domicilio.ciudad || "";

    document.getElementById("codigo_postal").value =
        domicilio.codigo_postal || "";

    document.getElementById("referencias").value =
        domicilio.referencias || "";

    domicilioEditando = id;

    tituloFormulario.textContent = "Editar domicilio";
    btnGuardar.textContent = "Actualizar domicilio";
    btnCancelar.hidden = false;

    formDomicilio.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

// CANCELAR EDICIÓN
function cancelarEdicion() {
    domicilioEditando = null;

    formDomicilio.reset();

    tituloFormulario.textContent = "Agregar domicilio";
    btnGuardar.textContent = "Guardar domicilio";
    btnCancelar.hidden = true;
}

btnCancelar.addEventListener("click", cancelarEdicion);

// ELIMINAR DOMICILIO
async function eliminarDomicilio(id) {
    try {
        await solicitarAPI(`${API_URL}/${id}`, {
            method: "DELETE"
        });

        if (Number(domicilioSeleccionado) === Number(id)) {
            domicilioSeleccionado = null;
            sessionStorage.removeItem("cubex_domicilio_id");
        }

        mostrarMensaje("Domicilio eliminado correctamente.");

        await cargarDomicilios();

    } catch (error) {
        mostrarMensaje(error.message, "error");
    }
}

// ACTUALIZAR LISTA
btnActualizar.addEventListener("click", cargarDomicilios);

// VOLVER AL CARRITO
btnVolverCarrito.addEventListener("click", () => {
    window.location.href = "index.html?abrirCarrito=1";
});

// CONFIRMAR PEDIDO
btnContinuarPago.addEventListener("click", async () => {

    // 1. Verificar domicilio
    if (!domicilioSeleccionado) {
        mostrarMensaje(
            "Selecciona un domicilio para confirmar tu pedido.",
            "error"
        );
        return;
    }

    // 2. Obtener usuario
    const usuario = obtenerUsuario();

    const idUsuario =
        usuario.idUsuario ??
        usuario.id ??
        usuario.id_usuario ??
        usuario.usuarioId;

    if (!idUsuario || !Number.isInteger(Number(idUsuario))) {
        mostrarMensaje(
            "No se pudo identificar tu usuario. Inicia sesión nuevamente.",
            "error"
        );
        return;
    }

    // 3. Obtener carrito del usuario actual
    const claveCarrito = `cubex_carrito_${idUsuario}`;

    let carrito = [];

    try {
        carrito = JSON.parse(
            sessionStorage.getItem(claveCarrito) || "[]"
        );

    } catch {
        mostrarMensaje("No se pudo leer tu carrito.", "error");
        return;
    }

    if (!Array.isArray(carrito) || carrito.length === 0) {
        mostrarMensaje("Tu carrito está vacío.", "error");
        return;
    }

    // 4. Preparar productos para el microservicio
    const productos = carrito.map(producto => ({
        id: Number(producto.id),
        cantidad: Number(producto.cantidad)
    }));

    if (productos.some(producto =>
        !Number.isInteger(producto.id) ||
        producto.id <= 0 ||
        !Number.isInteger(producto.cantidad) ||
        producto.cantidad <= 0
    )) {
        mostrarMensaje(
            "Hay productos o cantidades inválidas en tu carrito.",
            "error"
        );
        return;
    }

    // 5. Datos para pedidos.controller.js
    // La clave de idempotencia evita crear dos pedidos si el cliente
    // hace doble clic o la conexión se reintenta.
    let clavePedido = sessionStorage.getItem("cubex_clave_pedido");

    if (!clavePedido) {
        clavePedido = window.Cubex
            ? Cubex.claveUnica()
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
        sessionStorage.setItem("cubex_clave_pedido", clavePedido);
    }

    const datosPedido = {
        id_usuario: Number(idUsuario),
        id_direccion: Number(domicilioSeleccionado),
        productos,
        clave_idempotencia: clavePedido
    };

    try {
        btnContinuarPago.disabled = true;
        btnContinuarPago.textContent = "Creando pedido...";

        console.log("DATOS ENVIADOS AL MICROSERVICIO DE PEDIDOS:");
        console.log(datosPedido);

        // 6. Crear pedido pendiente en MySQL
        const respuesta = await solicitarAPI(PEDIDOS_URL, {
            method: "POST",
            body: JSON.stringify(datosPedido)
        });

        const pedido = respuesta.datos;
        const idPedido = pedido?.id;

        if (!idPedido) {
            throw new Error(
                "El servidor no devolvió el identificador del pedido."
            );
        }

        // 7. Guardar el pedido seleccionado para pago.html
        sessionStorage.setItem(
            "cubex_pedido_seleccionado",
            String(idPedido)
        );

        sessionStorage.setItem(
            "cubex_pedido_usuario",
            String(idUsuario)
        );

        sessionStorage.removeItem("cubex_clave_pedido");

        // 8. VACIAR EL CARRITO DEL NAVEGADOR
        // Los productos ya están guardados en MySQL:
        // carrito y detalle_carrito.
        sessionStorage.removeItem(claveCarrito);

        // 9. Mostrar confirmación
        mostrarMensaje(
            `Pedido #${idPedido} creado correctamente. Tu carrito se ha vaciado.`
        );

        console.log("PEDIDO CREADO:", pedido);
        console.log("CARRITO VACIADO:", claveCarrito);

        // 10. Ir a la página de pago
        setTimeout(() => {
            window.location.href = "pago.html";
        }, 1000);

    } catch (error) {
        console.error("ERROR AL CONFIRMAR PEDIDO:", error);

        if (error.status === 409 && error.datos?.codigo === "STOCK_INSUFICIENTE") {
            // El pedido no se creó: se puede generar una nueva solicitud.
            sessionStorage.removeItem("cubex_clave_pedido");

            const faltantes = (error.datos.detalle || [])
                .map(f => `${f.nombre} (disponibles: ${f.disponible})`)
                .join(", ");

            mostrarMensaje(
                `Actualiza tu carrito: ${faltantes || "algunos productos ya no tienen existencias"}. Regresando al carrito...`,
                "error"
            );

            setTimeout(() => {
                window.location.href = "index.html?abrirCarrito=1";
            }, 3500);

            return;
        }

        if (error.status === 400 || error.status === 403) {
            sessionStorage.removeItem("cubex_clave_pedido");
        }

        mostrarMensaje(error.message, "error");

        btnContinuarPago.disabled = false;
        btnContinuarPago.textContent = "Confirmar pedido →";
    }
});

// INICIAR
document.addEventListener("DOMContentLoaded", () => {
    cargarDomicilios();
});
