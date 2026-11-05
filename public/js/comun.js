/* =====================================================================
   CUBEX - UTILIDADES COMPARTIDAS (sesión, peticiones, formato y avisos)
   Requiere config.js cargado antes.
   ===================================================================== */

(function () {
    "use strict";

    const CONFIG = window.CUBEX_CONFIG;

    const ETIQUETAS_ESTADO = {
        // Pedidos
        pendiente: "Pendiente",
        procesando: "Procesando pago",
        confirmado: "Confirmado",
        cancelado: "Cancelado",
        // Envíos
        preparando: "Preparando envío",
        en_transito: "En tránsito",
        en_reparto: "En reparto",
        entregado: "Entregado",
        incidencia: "Incidencia",
        // Garantías y devoluciones
        en_revision: "En revisión",
        aprobada: "Aprobada",
        rechazada: "Rechazada",
        resuelta: "Resuelta",
        en_proceso: "En proceso de devolución",
        producto_recibido: "Producto recibido",
        reembolso_en_proceso: "Reembolso/reemplazo en proceso",
        completada: "Completada",
        // Validación
        validada: "Validada",
        confirmada_cliente: "Confirmada por el cliente"
    };

    const TONOS_ESTADO = {
        pendiente: "neutro",
        procesando: "info",
        confirmado: "exito",
        cancelado: "peligro",
        preparando: "info",
        en_transito: "info",
        en_reparto: "info",
        entregado: "exito",
        incidencia: "peligro",
        en_revision: "info",
        aprobada: "exito",
        rechazada: "peligro",
        resuelta: "exito",
        en_proceso: "info",
        producto_recibido: "info",
        reembolso_en_proceso: "info",
        completada: "exito",
        validada: "exito",
        confirmada_cliente: "info"
    };

    function escapar(valor) {
        return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        })[caracter]);
    }

    function moneda(valor) {
        const numero = Number(valor);

        if (!Number.isFinite(numero)) {
            return "—";
        }

        return numero.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
    }

    function convertirFecha(valor) {
        if (!valor) return null;

        // MySQL devuelve "YYYY-MM-DD HH:MM:SS"; se interpreta como hora local.
        const texto = String(valor).includes("T") ? String(valor) : String(valor).replace(" ", "T");
        const fecha = new Date(texto);

        return Number.isNaN(fecha.getTime()) ? null : fecha;
    }

    function fecha(valor, conHora = false) {
        const convertida = convertirFecha(valor);

        if (!convertida) return "—";

        return convertida.toLocaleString("es-MX", conHora
            ? { dateStyle: "medium", timeStyle: "short" }
            : { dateStyle: "medium" });
    }

    function fechaParaInput(valor, conHora = false) {
        const convertida = convertirFecha(valor);

        if (!convertida) return "";

        const pad = n => String(n).padStart(2, "0");
        const base = `${convertida.getFullYear()}-${pad(convertida.getMonth() + 1)}-${pad(convertida.getDate())}`;

        return conHora ? `${base}T${pad(convertida.getHours())}:${pad(convertida.getMinutes())}` : base;
    }

    function estado(valor) {
        const clave = String(valor || "pendiente").toLowerCase();
        const etiqueta = ETIQUETAS_ESTADO[clave] || clave.replace(/_/g, " ");
        const tono = TONOS_ESTADO[clave] || "neutro";

        return `<span class="cx-estado cx-estado-${tono}">${escapar(etiqueta)}</span>`;
    }

    function etiquetaEstado(valor) {
        const clave = String(valor || "").toLowerCase();
        return ETIQUETAS_ESTADO[clave] || clave.replace(/_/g, " ");
    }

    function urlImagen(ruta) {
        if (!ruta) return "";
        if (/^https?:\/\//i.test(ruta)) return ruta;
        return `${CONFIG.API.INVENTARIO}${ruta.startsWith("/") ? "" : "/"}${ruta}`;
    }

    // ---------------------------------------------------------------
    // SESIÓN
    // ---------------------------------------------------------------

    function token() {
        return sessionStorage.getItem(CONFIG.CLAVE_TOKEN);
    }

    function usuario() {
        try {
            return JSON.parse(sessionStorage.getItem(CONFIG.CLAVE_USUARIO) || "null");
        } catch {
            return null;
        }
    }

    function rol() {
        return String(usuario()?.rol || "").toUpperCase();
    }

    function cerrarSesion(destino = "login.html") {
        sessionStorage.removeItem(CONFIG.CLAVE_TOKEN);
        sessionStorage.removeItem(CONFIG.CLAVE_USUARIO);
        window.location.replace(destino);
    }

    // ---------------------------------------------------------------
    // PETICIONES
    // ---------------------------------------------------------------

    class ErrorApi extends Error {
        constructor(mensaje, status, datos) {
            super(mensaje);
            this.status = status;
            this.datos = datos || {};
        }
    }

    async function api(url, opciones = {}) {
        const configuracion = { ...opciones };
        const cabeceras = new Headers(opciones.headers || {});

        if (configuracion.body && !(configuracion.body instanceof FormData) && typeof configuracion.body !== "string") {
            configuracion.body = JSON.stringify(configuracion.body);
        }

        if (configuracion.body && !(configuracion.body instanceof FormData) && !cabeceras.has("Content-Type")) {
            cabeceras.set("Content-Type", "application/json");
        }

        configuracion.headers = cabeceras;

        let respuesta;

        try {
            respuesta = await fetch(url, configuracion);
        } catch {
            throw new ErrorApi(
                "No se pudo conectar con el servidor. Verifica que los servicios de CUBEX estén iniciados.",
                0
            );
        }

        const datos = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok || datos.exitoso === false || datos.success === false) {
            let mensaje = datos.mensaje || datos.message || datos.error || datos.detail ||
                `Error ${respuesta.status} del servidor.`;

            if (respuesta.status === 401) {
                mensaje = datos.mensaje || "Tu sesión expiró. Inicia sesión nuevamente.";
            }

            throw new ErrorApi(mensaje, respuesta.status, datos);
        }

        return datos;
    }

    // ---------------------------------------------------------------
    // AVISOS (toasts)
    // ---------------------------------------------------------------

    function aviso(mensaje, tipo = "exito", duracion = 4500) {
        let contenedor = document.getElementById("cx-avisos");

        if (!contenedor) {
            contenedor = document.createElement("div");
            contenedor.id = "cx-avisos";
            contenedor.setAttribute("role", "status");
            contenedor.setAttribute("aria-live", "polite");
            document.body.appendChild(contenedor);
        }

        const elemento = document.createElement("div");
        elemento.className = `cx-aviso cx-aviso-${tipo}`;
        elemento.textContent = mensaje;
        contenedor.appendChild(elemento);

        setTimeout(() => {
            elemento.classList.add("cx-aviso-saliendo");
            setTimeout(() => elemento.remove(), 300);
        }, duracion);
    }

    // Dentro de un iframe del panel, coloca la ventana en la zona visible.
    function ubicarEnIframe(fondo) {
        try {
            const marco = window.frameElement;

            if (!marco) return;

            const visibleDesde = Math.max(0, -marco.getBoundingClientRect().top);
            fondo.querySelector(".cx-modal").style.marginTop = `${visibleDesde}px`;
        } catch {
            // Sin acceso al documento padre: se deja la posición normal.
        }
    }

    // Ventana de confirmación accesible (sustituye a confirm()).
    function confirmar({ titulo = "Confirmar", mensaje = "", textoConfirmar = "Confirmar", peligro = false } = {}) {
        return new Promise(resolve => {
            const fondo = document.createElement("div");
            fondo.className = "cx-modal-fondo";
            fondo.innerHTML = `
                <div class="cx-modal" role="dialog" aria-modal="true" aria-labelledby="cxConfirmarTitulo">
                    <h3 id="cxConfirmarTitulo">${escapar(titulo)}</h3>
                    <p>${escapar(mensaje)}</p>
                    <div class="cx-modal-acciones">
                        <button type="button" class="cx-btn cx-btn-secundario" data-r="0">Cancelar</button>
                        <button type="button" class="cx-btn ${peligro ? "cx-btn-peligro" : "cx-btn-primario"}" data-r="1">${escapar(textoConfirmar)}</button>
                    </div>
                </div>`;

            function cerrar(valor) {
                document.removeEventListener("keydown", teclado);
                fondo.remove();
                resolve(valor);
            }

            function teclado(evento) {
                if (evento.key === "Escape") cerrar(false);
            }

            fondo.addEventListener("click", evento => {
                if (evento.target === fondo) cerrar(false);
                const boton = evento.target.closest("[data-r]");
                if (boton) cerrar(boton.dataset.r === "1");
            });

            document.addEventListener("keydown", teclado);
            document.body.appendChild(fondo);
            ubicarEnIframe(fondo);
            fondo.querySelector('[data-r="1"]').focus({ preventScroll: true });
        });
    }

    // Abre un diálogo con contenido HTML propio. Devuelve el elemento.
    function dialogo(html, { ancho = 640 } = {}) {
        const fondo = document.createElement("div");
        fondo.className = "cx-modal-fondo";
        fondo.innerHTML = `
            <div class="cx-modal" role="dialog" aria-modal="true" style="max-width:${Number(ancho)}px">
                <button type="button" class="cx-modal-cerrar" aria-label="Cerrar">&times;</button>
                ${html}
            </div>`;

        function cerrar() {
            document.removeEventListener("keydown", teclado);
            fondo.remove();
        }

        function teclado(evento) {
            if (evento.key === "Escape") cerrar();
        }

        fondo.addEventListener("click", evento => {
            if (evento.target === fondo || evento.target.closest(".cx-modal-cerrar")) cerrar();
        });

        document.addEventListener("keydown", teclado);
        document.body.appendChild(fondo);
        ubicarEnIframe(fondo);
        fondo.cerrar = cerrar;
        return fondo;
    }

    // Ajusta la altura del iframe en el panel principal.
    function informarAltura() {
        if (window.parent === window) return;

        const enviar = () => {
            const altura = Math.max(
                document.documentElement.scrollHeight,
                document.body ? document.body.scrollHeight : 0
            );

            window.parent.postMessage({ tipo: "cubex-altura", altura }, window.location.origin);
        };

        enviar();
        new ResizeObserver(enviar).observe(document.documentElement);
    }

    function claveUnica() {
        if (window.crypto && crypto.randomUUID) {
            return crypto.randomUUID().replace(/-/g, "");
        }

        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    }

    window.Cubex = {
        CONFIG,
        escapar,
        moneda,
        fecha,
        fechaParaInput,
        estado,
        etiquetaEstado,
        urlImagen,
        token,
        usuario,
        rol,
        cerrarSesion,
        api,
        ErrorApi,
        aviso,
        confirmar,
        dialogo,
        informarAltura,
        claveUnica
    };
})();
