
/* =====================================================
   CUBEX - LOGÍSTICA DE ENVÍOS
   Archivo: js/envios.js
   Puerto del microservicio: 3032
===================================================== */

const API_ENVIOS = CUBEX_CONFIG.API.LOGISTICA + "/envios";

let listaEnvios = [];

// ELEMENTOS HTML
const formulario = document.getElementById("formEnvio");
const tablaEnvios = document.getElementById("tablaEnvios");
const mensajeEnvios = document.getElementById("mensajeEnvios");

const totalEnvios = document.getElementById("totalEnvios");
const totalPreparando = document.getElementById("totalPreparando");
const totalTransito = document.getElementById("totalTransito");
const totalEntregados = document.getElementById("totalEntregados");

const buscarEnvio = document.getElementById("buscarEnvio");
const filtroEstado = document.getElementById("filtroEstado");

const btnActualizar = document.getElementById("btnActualizar");
const btnGuardar = document.getElementById("btnGuardar");
const btnLimpiar = document.getElementById("btnLimpiar");


// =====================================================
// MOSTRAR MENSAJES
// =====================================================

function mostrarMensaje(texto, tipo = "info") {
    mensajeEnvios.textContent = texto;
    mensajeEnvios.className = `envios-mensaje visible ${tipo}`;
}

function ocultarMensaje() {
    mensajeEnvios.textContent = "";
    mensajeEnvios.className = "envios-mensaje";
}


// =====================================================
// ESCAPAR TEXTO HTML
// =====================================================

function escaparHTML(valor) {
    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caracter]);
}


// =====================================================
// PROCESAR RESPUESTA DEL SERVIDOR
// =====================================================

function obtenerLista(respuesta) {

    if (Array.isArray(respuesta)) {
        return respuesta;
    }

    if (Array.isArray(respuesta.datos)) {
        return respuesta.datos;
    }

    if (Array.isArray(respuesta.envios)) {
        return respuesta.envios;
    }

    if (Array.isArray(respuesta.data)) {
        return respuesta.data;
    }

    return [];
}


// =====================================================
// NORMALIZAR ESTADOS
// =====================================================

function normalizarEstado(estado) {
    return String(estado || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function claseEstado(estado) {

    const valor = normalizarEstado(estado);

    if (valor === "preparando") return "preparando";
    if (valor === "enviado") return "enviado";
    if (valor === "en transito") return "transito";
    if (valor === "entregado") return "entregado";
    if (valor === "incidencia") return "incidencia";

    return "preparando";
}


// =====================================================
// FORMATEAR FECHAS
// =====================================================

function formatearFecha(fecha) {

    if (!fecha) return "--";

    const texto = String(fecha).substring(0, 10);
    const partes = texto.split("-");

    if (partes.length !== 3) {
        return escaparHTML(fecha);
    }

    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}


// =====================================================
// CARGAR ENVÍOS DESDE MYSQL
// =====================================================

async function cargarEnvios() {

    tablaEnvios.innerHTML = `
        <tr>
            <td colspan="7" class="envios-vacio">
                Cargando envíos...
            </td>
        </tr>
    `;

    ocultarMensaje();

    try {

        const respuesta = await fetch(API_ENVIOS);

        if (!respuesta.ok) {
            throw new Error(`Error HTTP ${respuesta.status}`);
        }

        const resultado = await respuesta.json();

        if (resultado.exitoso === false) {
            throw new Error(
                resultado.mensaje || "No fue posible consultar los envíos."
            );
        }

        listaEnvios = obtenerLista(resultado);

        actualizarEstadisticas();
        mostrarEnvios();

    } catch (error) {

        console.error("Error al cargar envíos:", error);

        listaEnvios = [];
        actualizarEstadisticas();

        tablaEnvios.innerHTML = `
            <tr>
                <td colspan="7" class="envios-vacio">
                    No fue posible cargar los envíos.
                </td>
            </tr>
        `;

        mostrarMensaje(
            "No se pudo conectar con el microservicio de logística. Verifica que esté iniciado en el puerto 3032.",
            "error"
        );
    }
}


// =====================================================
// ACTUALIZAR ESTADÍSTICAS
// =====================================================

function actualizarEstadisticas() {

    totalEnvios.textContent = listaEnvios.length;

    totalPreparando.textContent = listaEnvios.filter(envio =>
        normalizarEstado(envio.estado) === "preparando"
    ).length;

    totalTransito.textContent = listaEnvios.filter(envio =>
        ["en transito", "enviado"].includes(
            normalizarEstado(envio.estado)
        )
    ).length;

    totalEntregados.textContent = listaEnvios.filter(envio =>
        normalizarEstado(envio.estado) === "entregado"
    ).length;
}


// =====================================================
// MOSTRAR ENVÍOS EN LA TABLA
// =====================================================

function mostrarEnvios() {

    const texto = buscarEnvio.value.trim().toLowerCase();
    const estadoSeleccionado = filtroEstado.value;

    const filtrados = listaEnvios.filter(envio => {

        const idPedido = String(
            envio.pedido_id ??
            envio.id_pedido ??
            envio.idPedido ??
            ""
        );

        const guia = String(
            envio.numero_guia ??
            envio.numeroGuia ??
            ""
        );

        const paqueteria = String(envio.paqueteria ?? "");
        const estado = String(envio.estado ?? "");

        const coincideBusqueda =
            idPedido.toLowerCase().includes(texto) ||
            guia.toLowerCase().includes(texto) ||
            paqueteria.toLowerCase().includes(texto);

        const coincideEstado =
            !estadoSeleccionado ||
            estado === estadoSeleccionado;

        return coincideBusqueda && coincideEstado;
    });

    if (filtrados.length === 0) {

        tablaEnvios.innerHTML = `
            <tr>
                <td colspan="7" class="envios-vacio">
                    No hay envíos que coincidan con la búsqueda.
                </td>
            </tr>
        `;

        return;
    }

    tablaEnvios.innerHTML = filtrados.map(envio => {

        const id = Number(envio.id);

        const pedido =
            envio.pedido_id ??
            envio.id_pedido ??
            envio.idPedido ??
            "--";

        const paqueteria = envio.paqueteria ?? "--";

        const guia =
            envio.numero_guia ??
            envio.numeroGuia ??
            "--";

        const fechaEnvio =
            envio.fecha_envio ??
            envio.fechaEnvio;

        const fechaEstimada =
            envio.fecha_estimada ??
            envio.fechaEstimada;

        const estado = envio.estado ?? "Preparando";

        return `
            <tr>
                <td>
                    <strong>#${escaparHTML(pedido)}</strong>
                </td>

                <td>${escaparHTML(paqueteria)}</td>

                <td>${escaparHTML(guia)}</td>

                <td>${formatearFecha(fechaEnvio)}</td>

                <td>${formatearFecha(fechaEstimada)}</td>

                <td>
                    <span class="envios-estado ${claseEstado(estado)}">
                        ${escaparHTML(estado)}
                    </span>
                </td>

                <td>
                    <div class="envios-acciones">
                        <button
                            type="button"
                            class="envios-btn-tabla"
                            data-editar="${id}">
                            Editar
                        </button>
                    </div>
                </td>
            </tr>
        `;

    }).join("");
}


// =====================================================
// REGISTRAR O ACTUALIZAR ENVÍO
// =====================================================

formulario.addEventListener("submit", async function(evento) {

    evento.preventDefault();

    ocultarMensaje();

    const id = document.getElementById("envioId").value;

    const datos = {

        pedido_id: Number(
            document.getElementById("pedidoId").value
        ),

        paqueteria:
            document.getElementById("paqueteria").value,

        numero_guia:
            document.getElementById("numeroGuia").value.trim() || null,

        fecha_envio:
            document.getElementById("fechaEnvio").value || null,

        fecha_estimada:
            document.getElementById("fechaEstimada").value || null,

        estado:
            document.getElementById("estadoEnvio").value,

        observaciones:
            document.getElementById("observaciones").value.trim() || null
    };

    if (!datos.pedido_id || !datos.paqueteria || !datos.estado) {

        mostrarMensaje(
            "Completa los campos obligatorios.",
            "error"
        );

        return;
    }

    if (
        datos.fecha_envio &&
        datos.fecha_estimada &&
        datos.fecha_estimada < datos.fecha_envio
    ) {

        mostrarMensaje(
            "La fecha estimada no puede ser anterior a la fecha de envío.",
            "error"
        );

        return;
    }

    const metodo = id ? "PATCH" : "POST";

    const url = id
        ? `${API_ENVIOS}/${encodeURIComponent(id)}`
        : API_ENVIOS;

    btnGuardar.disabled = true;
    btnGuardar.textContent = id
        ? "Actualizando..."
        : "Guardando...";

    try {

        const respuesta = await fetch(url, {

            method: metodo,

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify(datos)

        });

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok || resultado.exitoso === false) {

            throw new Error(
                resultado.mensaje ||
                resultado.error ||
                `Error HTTP ${respuesta.status}`
            );
        }

        formulario.reset();

        document.getElementById("envioId").value = "";

        btnGuardar.textContent = "Guardar envío";

        mostrarMensaje(
            id
                ? "El envío se actualizó correctamente."
                : "El envío se registró correctamente.",
            "exito"
        );

        await cargarEnvios();

    } catch (error) {

        console.error("Error al guardar envío:", error);

        mostrarMensaje(
            error.message || "Ocurrió un error al guardar el envío.",
            "error"
        );

    } finally {

        btnGuardar.disabled = false;

        btnGuardar.textContent =
            document.getElementById("envioId").value
                ? "Actualizar envío"
                : "Guardar envío";
    }
});


// =====================================================
// EDITAR ENVÍO
// =====================================================

tablaEnvios.addEventListener("click", function(evento) {

    const boton = evento.target.closest("[data-editar]");

    if (!boton) return;

    const id = Number(boton.dataset.editar);

    const envio = listaEnvios.find(item =>
        Number(item.id) === id
    );

    if (!envio) {

        mostrarMensaje(
            "No se encontró el envío seleccionado.",
            "error"
        );

        return;
    }

    document.getElementById("envioId").value = envio.id;

    document.getElementById("pedidoId").value =
        envio.pedido_id ??
        envio.id_pedido ??
        envio.idPedido ??
        "";

    document.getElementById("paqueteria").value =
        envio.paqueteria ?? "";

    document.getElementById("numeroGuia").value =
        envio.numero_guia ??
        envio.numeroGuia ??
        "";

    document.getElementById("fechaEnvio").value =
        String(
            envio.fecha_envio ??
            envio.fechaEnvio ??
            ""
        ).substring(0, 10);

    document.getElementById("fechaEstimada").value =
        String(
            envio.fecha_estimada ??
            envio.fechaEstimada ??
            ""
        ).substring(0, 10);

    document.getElementById("estadoEnvio").value =
        envio.estado ?? "Preparando";

    document.getElementById("observaciones").value =
        envio.observaciones ?? "";

    btnGuardar.textContent = "Actualizar envío";

    mostrarMensaje(
        `Editando el envío del pedido #${
            envio.pedido_id ??
            envio.id_pedido ??
            envio.idPedido
        }.`,
        "info"
    );

    formulario.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});


// =====================================================
// LIMPIAR FORMULARIO
// =====================================================

btnLimpiar.addEventListener("click", function() {

    document.getElementById("envioId").value = "";

    btnGuardar.textContent = "Guardar envío";

    ocultarMensaje();
});


// =====================================================
// BUSCADOR Y FILTRO
// =====================================================

buscarEnvio.addEventListener("input", mostrarEnvios);

filtroEstado.addEventListener("change", mostrarEnvios);


// =====================================================
// ACTUALIZAR LISTADO
// =====================================================

btnActualizar.addEventListener("click", cargarEnvios);


// =====================================================
// INICIAR MÓDULO
// =====================================================

cargarEnvios();
