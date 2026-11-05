/* =====================================================================
   CUBEX - LOGÍSTICA Y POSTVENTA (panel de administrador / empleado)
   Módulos: envíos y rastreo, validación de entregas, garantías y
   devoluciones. Toda la información se guarda en MySQL mediante el
   microservicio de logística (puerto 3032). Ya no se usa localStorage.
   ===================================================================== */

(function () {
    "use strict";

    const C = window.Cubex;
    const API = CUBEX_CONFIG.API.LOGISTICA;
    const MODULO = document.body.dataset.module;
    const main = document.querySelector(".log-wrap");

    const PAQUETERIAS = ["Estafeta", "DHL", "FedEx", "Paquetexpress", "Correos de México", "Otra"];

    const ESTADOS_ENVIO = [
        ["pendiente", "Pendiente"],
        ["preparando", "Preparando envío"],
        ["en_transito", "En tránsito"],
        ["en_reparto", "En reparto"],
        ["entregado", "Entregado"],
        ["incidencia", "Incidencia"],
        ["cancelado", "Cancelado"]
    ];

    // ------------------------------------------------------------
    // ACCESO
    // ------------------------------------------------------------

    const rol = C.rol();

    if (!C.token() || !["ADMIN", "VENDEDOR"].includes(rol)) {
        main.innerHTML = `
            <div class="log-sin-acceso">
                <h2>Acceso restringido</h2>
                <p>Inicia sesión con una cuenta de administrador o empleado para usar este módulo.</p>
            </div>`;
        C.informarAltura();
        return;
    }

    const esAdmin = rol === "ADMIN";

    function errorCarga(contenedor, error) {
        contenedor.innerHTML = `
            <div class="cx-vacio">
                <strong>No se pudo cargar la información</strong>
                ${C.escapar(error.message)}
            </div>`;

        if (error.status === 401) {
            C.aviso("Tu sesión expiró. Vuelve a iniciar sesión.", "error", 8000);
        }
    }

    function tabla(encabezados, filas, vacio = "No hay registros.") {
        if (!filas.length) {
            return `<div class="cx-vacio"><strong>${C.escapar(vacio)}</strong></div>`;
        }

        return `
            <div class="cx-tabla-contenedor">
                <table class="cx-tabla">
                    <thead><tr>${encabezados.map(e => `<th scope="col">${e}</th>`).join("")}</tr></thead>
                    <tbody>${filas.join("")}</tbody>
                </table>
            </div>`;
    }

    function direccionTexto(fila) {
        return [fila.calle_numero, fila.colonia, fila.ciudad, fila.codigo_postal].filter(Boolean).join(", ") || "—";
    }

    function opciones(lista, seleccionado) {
        return lista.map(([valor, texto]) =>
            `<option value="${C.escapar(valor)}" ${valor === seleccionado ? "selected" : ""}>${C.escapar(texto)}</option>`
        ).join("");
    }

    function retraso(funcion, ms = 300) {
        let temporizador;
        return (...argumentos) => {
            clearTimeout(temporizador);
            temporizador = setTimeout(() => funcion(...argumentos), ms);
        };
    }

    function historialHTML(historial, campoEstado = "estado") {
        if (!historial || !historial.length) {
            return '<p class="log-sub">Sin movimientos registrados.</p>';
        }

        return `
            <ul class="cx-historial">
                ${historial.slice().reverse().map(h => `
                    <li>
                        <strong>${C.escapar(C.etiquetaEstado(h[campoEstado]))}</strong>
                        · ${C.fecha(h.fecha, true)}
                        ${h.ubicacion ? ` · ${C.escapar(h.ubicacion)}` : ""}
                        ${h.registrado_por || h.usuario ? ` · <small>${C.escapar(h.registrado_por || h.usuario)}</small>` : ""}
                        ${h.descripcion || h.comentario ? `<br>${C.escapar(h.descripcion || h.comentario)}` : ""}
                    </li>`).join("")}
            </ul>`;
    }

    async function enviarFormulario(formulario, boton, accion) {
        const texto = boton.textContent;
        boton.disabled = true;
        boton.textContent = "Guardando...";

        try {
            await accion();
        } catch (error) {
            const mensaje = formulario.querySelector(".cx-mensaje");

            if (mensaje) {
                mensaje.className = "cx-mensaje cx-mensaje-error";
                mensaje.textContent = error.message;
            } else {
                C.aviso(error.message, "error", 7000);
            }
        } finally {
            boton.disabled = false;
            boton.textContent = texto;
        }
    }

    async function verEvidencia(tipo, id) {
        try {
            const respuesta = await fetch(`${API}/postventa/evidencias/${tipo}/${id}`);

            if (!respuesta.ok) throw new Error("No se pudo abrir la evidencia.");

            const url = URL.createObjectURL(await respuesta.blob());
            C.dialogo(`<h3>Evidencia del cliente</h3><img src="${url}" alt="Evidencia" style="max-width:100%;border-radius:10px">`);
        } catch (error) {
            C.aviso(error.message, "error");
        }
    }

    // ================================================================
    // ENVÍOS Y RASTREO
    // ================================================================

    function iniciarEnvios() {
        const tablaPorEnviar = document.getElementById("tablaPorEnviar");
        const tablaEnvios = document.getElementById("tablaEnvios");
        const buscar = document.getElementById("buscar");
        const filtroEstado = document.getElementById("filtroEstado");
        const soloRetrasados = document.getElementById("soloRetrasados");

        let porEnviar = [];
        let envios = [];

        async function cargarPorEnviar() {
            try {
                const resultado = await C.api(`${API}/envios/por-enviar`, { cache: "no-store" });
                porEnviar = resultado.datos || [];

                tablaPorEnviar.innerHTML = tabla(
                    ["Pedido", "Fecha", "Cliente", "Dirección de entrega", "Artículos", "Total", "Acción"],
                    porEnviar.map((p, i) => `
                        <tr>
                            <td><strong>#${Number(p.id_pedido)}</strong></td>
                            <td>${C.fecha(p.fecha, true)}</td>
                            <td>${C.escapar(p.cliente_nombre)}<br><small>${C.escapar(p.cliente_correo || "")}</small></td>
                            <td>${C.escapar(direccionTexto(p))}${p.referencias ? `<br><small>Ref.: ${C.escapar(p.referencias)}</small>` : ""}</td>
                            <td>${Number(p.articulos)}</td>
                            <td>${C.moneda(p.total)}</td>
                            <td><button type="button" class="cx-btn cx-btn-primario cx-btn-chico" data-registrar="${i}">Registrar envío</button></td>
                        </tr>`),
                    "No hay pedidos pendientes de envío."
                );
            } catch (error) {
                errorCarga(tablaPorEnviar, error);
            }
        }

        async function cargarEnvios() {
            const parametros = new URLSearchParams();

            if (buscar.value.trim()) parametros.set("q", buscar.value.trim());
            if (filtroEstado.value) parametros.set("estado", filtroEstado.value);
            if (soloRetrasados.checked) parametros.set("retrasados", "1");

            try {
                const resultado = await C.api(`${API}/envios?${parametros}`, { cache: "no-store" });
                envios = resultado.datos || [];
                const resumen = resultado.resumen || {};

                document.getElementById("statTotal").textContent = resumen.total ?? 0;
                document.getElementById("statPendientes").textContent = resumen.pendientes ?? 0;
                document.getElementById("statCamino").textContent = resumen.en_camino ?? 0;
                document.getElementById("statEntregados").textContent = resumen.entregados ?? 0;
                document.getElementById("statIncidencias").textContent = resumen.incidencias ?? 0;
                document.getElementById("statRetrasados").textContent = resumen.retrasados ?? 0;

                tablaEnvios.innerHTML = tabla(
                    ["Pedido", "Cliente", "Paquetería / guía", "Envío", "Entrega estimada", "Estado", "Acciones"],
                    envios.map((e, i) => `
                        <tr>
                            <td><strong>#${Number(e.id_pedido)}</strong></td>
                            <td>${C.escapar(e.cliente_nombre)}<br><small>${C.escapar(e.ciudad || "")}</small></td>
                            <td>${e.num_guia
                                ? `${C.escapar(e.paqueteria)}<br><span class="log-mono">${C.escapar(e.num_guia)}</span>`
                                : '<small>Guía pendiente de asignación</small>'}</td>
                            <td>${C.fecha(e.fecha_envio)}</td>
                            <td>${C.fecha(e.fecha_estimada_entrega)}</td>
                            <td>${C.estado(e.estado)}${e.retrasado ? '<br><span class="log-insignia">Retrasado</span>' : ""}</td>
                            <td>
                                <div class="cx-acciones-fila">
                                    <button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-detalle="${Number(e.id)}">Detalle</button>
                                    ${e.estado === "entregado"
                                        ? ""
                                        : `<button type="button" class="cx-btn cx-btn-azul cx-btn-chico" data-actualizar="${i}">Actualizar</button>`}
                                </div>
                            </td>
                        </tr>`),
                    "No se encontraron envíos."
                );
            } catch (error) {
                errorCarga(tablaEnvios, error);
            }
        }

        function formularioEnvio(datos, { nuevo }) {
            const paqueteria = datos.paqueteria || "";
            const listaPaqueterias = PAQUETERIAS.includes(paqueteria) || !paqueteria
                ? PAQUETERIAS
                : [paqueteria, ...PAQUETERIAS];

            const estados = nuevo
                ? ESTADOS_ENVIO.filter(([v]) => !["entregado", "cancelado"].includes(v))
                : ESTADOS_ENVIO;

            return `
                <form class="cx-form" novalidate>
                    <div class="cx-campo">
                        <label for="fPaqueteria">Paquetería</label>
                        <select id="fPaqueteria" name="paqueteria">
                            <option value="">Sin asignar</option>
                            ${listaPaqueterias.map(p => `<option ${p === paqueteria ? "selected" : ""}>${C.escapar(p)}</option>`).join("")}
                        </select>
                    </div>
                    <div class="cx-campo">
                        <label for="fGuia">Número de guía</label>
                        <input id="fGuia" name="num_guia" maxlength="100" value="${C.escapar(datos.num_guia || "")}" placeholder="Pendiente de asignación">
                    </div>
                    <div class="cx-campo">
                        <label for="fEstado">Estado *</label>
                        <select id="fEstado" name="estado" required>${opciones(estados, datos.estado || "pendiente")}</select>
                    </div>
                    <div class="cx-campo">
                        <label for="fFechaEnvio">Fecha de envío</label>
                        <input type="date" id="fFechaEnvio" name="fecha_envio" value="${C.fechaParaInput(datos.fecha_envio)}">
                    </div>
                    <div class="cx-campo">
                        <label for="fEstimada">Entrega estimada</label>
                        <input type="date" id="fEstimada" name="fecha_estimada_entrega" value="${C.fechaParaInput(datos.fecha_estimada_entrega)}">
                    </div>
                    <div class="cx-campo">
                        <label for="fUbicacion">Ubicación del movimiento</label>
                        <input id="fUbicacion" name="ubicacion" maxlength="150" placeholder="Ej. Centro de distribución Culiacán">
                    </div>
                    <div class="cx-campo cx-campo-completo">
                        <label for="fDescripcion">Descripción del movimiento (visible para el cliente)</label>
                        <input id="fDescripcion" name="descripcion" maxlength="500" placeholder="Ej. Paquete recolectado por la paquetería">
                    </div>
                    <div class="cx-campo cx-campo-completo">
                        <label for="fObservaciones">Observaciones internas</label>
                        <textarea id="fObservaciones" name="observaciones" maxlength="500">${C.escapar(datos.observaciones || "")}</textarea>
                    </div>
                    <p class="cx-mensaje cx-campo-completo" role="alert"></p>
                    <div class="cx-form-acciones">
                        <button type="button" class="cx-btn cx-btn-secundario" data-cerrar>Cancelar</button>
                        <button type="submit" class="cx-btn cx-btn-primario">${nuevo ? "Registrar envío" : "Guardar cambios"}</button>
                    </div>
                </form>`;
        }

        function leerFormulario(formulario) {
            const datos = Object.fromEntries(new FormData(formulario).entries());
            Object.keys(datos).forEach(clave => {
                if (typeof datos[clave] === "string") datos[clave] = datos[clave].trim();
            });
            if (!datos.fecha_envio) datos.fecha_envio = null;
            if (!datos.fecha_estimada_entrega) datos.fecha_estimada_entrega = null;
            if (!datos.num_guia) datos.num_guia = null;
            if (!datos.paqueteria) datos.paqueteria = null;
            return datos;
        }

        function abrirRegistro(pedido) {
            const ventana = C.dialogo(`
                <h3>Registrar envío del pedido #${Number(pedido.id_pedido)}</h3>
                <div class="log-detalle-grid">
                    <div><span>Cliente</span><strong>${C.escapar(pedido.cliente_nombre)}</strong></div>
                    <div><span>Dirección</span><strong>${C.escapar(direccionTexto(pedido))}</strong></div>
                </div>
                ${formularioEnvio({}, { nuevo: true })}`, { ancho: 720 });

            const formulario = ventana.querySelector("form");
            ventana.querySelector("[data-cerrar]").addEventListener("click", () => ventana.cerrar());

            formulario.addEventListener("submit", evento => {
                evento.preventDefault();
                const boton = formulario.querySelector('button[type="submit"]');

                enviarFormulario(formulario, boton, async () => {
                    const datos = { ...leerFormulario(formulario), id_pedido: pedido.id_pedido };
                    const resultado = await C.api(`${API}/envios`, { method: "POST", body: datos });
                    ventana.cerrar();
                    C.aviso(resultado.mensaje, "exito");
                    await Promise.all([cargarPorEnviar(), cargarEnvios()]);
                });
            });
        }

        function abrirActualizacion(envio) {
            const ventana = C.dialogo(`
                <h3>Actualizar envío del pedido #${Number(envio.id_pedido)}</h3>
                <p class="log-sub">Estado actual: ${C.estado(envio.estado)}. Solo registra movimientos reales informados por la paquetería.</p>
                ${formularioEnvio(envio, { nuevo: false })}`, { ancho: 720 });

            const formulario = ventana.querySelector("form");
            ventana.querySelector("[data-cerrar]").addEventListener("click", () => ventana.cerrar());

            formulario.addEventListener("submit", evento => {
                evento.preventDefault();
                const boton = formulario.querySelector('button[type="submit"]');

                enviarFormulario(formulario, boton, async () => {
                    const resultado = await C.api(`${API}/envios/${envio.id}`, {
                        method: "PATCH",
                        body: leerFormulario(formulario)
                    });
                    ventana.cerrar();
                    C.aviso(resultado.mensaje, "exito");
                    await cargarEnvios();
                });
            });
        }

        async function abrirDetalle(id) {
            const ventana = C.dialogo('<div class="cx-cargando">Cargando envío...</div>', { ancho: 820 });

            try {
                const { datos: e } = await C.api(`${API}/envios/${id}`, { cache: "no-store" });
                const contenedor = ventana.querySelector(".cx-modal");

                contenedor.innerHTML = `
                    <button type="button" class="cx-modal-cerrar" aria-label="Cerrar">&times;</button>
                    <h3>Envío del pedido #${Number(e.id_pedido)}</h3>
                    <p>${C.estado(e.estado)} ${e.retrasado ? '<span class="log-insignia">Retrasado</span>' : ""}</p>

                    <div class="log-detalle-grid">
                        <div><span>Cliente</span><strong>${C.escapar(e.cliente_nombre)}</strong></div>
                        <div><span>Correo</span><strong>${C.escapar(e.cliente_correo || "—")}</strong></div>
                        <div><span>Teléfono</span><strong>${C.escapar(e.cliente_telefono || "—")}</strong></div>
                        <div><span>Dirección</span><strong>${C.escapar(direccionTexto(e))}</strong></div>
                        <div><span>Referencias</span><strong>${C.escapar(e.referencias || "—")}</strong></div>
                        <div><span>Paquetería</span><strong>${C.escapar(e.paqueteria || "Sin asignar")}</strong></div>
                        <div><span>Número de guía</span><strong class="log-mono">${C.escapar(e.num_guia || "Pendiente")}</strong></div>
                        <div><span>Fecha de envío</span><strong>${C.fecha(e.fecha_envio)}</strong></div>
                        <div><span>Entrega estimada</span><strong>${C.fecha(e.fecha_estimada_entrega)}</strong></div>
                        <div><span>Total del pedido</span><strong>${C.moneda(e.total)}</strong></div>
                    </div>

                    ${e.observaciones ? `<p class="cx-mensaje cx-mensaje-info"><strong>Observaciones:</strong> ${C.escapar(e.observaciones)}</p>` : ""}

                    <div class="log-seccion-modal">
                        <h4>Productos</h4>
                        ${tabla(["Producto", "Cantidad", "Precio", "Subtotal"], (e.productos || []).map(p => `
                            <tr><td>${C.escapar(p.nombre)}</td><td>${Number(p.cantidad)}</td>
                            <td>${C.moneda(p.precio_unitario)}</td><td>${C.moneda(p.subtotal)}</td></tr>`))}
                    </div>

                    <div class="log-seccion-modal">
                        <h4>Historial de movimientos</h4>
                        ${historialHTML(e.historial)}
                    </div>

                    <div class="log-seccion-modal">
                        <h4>Validación de entrega</h4>
                        ${e.validado
                            ? `<p>Recibió <strong>${C.escapar(e.recibido_por)}</strong> el ${C.fecha(e.fecha_entrega_real, true)}
                               · validó ${C.escapar(e.validado_por || "—")}</p>
                               ${e.observaciones_entrega ? `<p class="log-sub">${C.escapar(e.observaciones_entrega)}</p>` : ""}`
                            : '<p class="log-sub">Pendiente de validar.</p>'}
                        ${e.confirmado_cliente ? `<p class="log-sub">El cliente confirmó la recepción el ${C.fecha(e.fecha_confirmacion_cliente, true)}${e.comentario_cliente ? `: "${C.escapar(e.comentario_cliente)}"` : ""}.</p>` : ""}
                    </div>`;
            } catch (error) {
                ventana.querySelector(".cx-modal").innerHTML = `
                    <button type="button" class="cx-modal-cerrar" aria-label="Cerrar">&times;</button>
                    <div class="cx-vacio"><strong>No se pudo cargar el envío</strong>${C.escapar(error.message)}</div>`;
            }
        }

        tablaPorEnviar.addEventListener("click", evento => {
            const boton = evento.target.closest("[data-registrar]");
            if (boton) abrirRegistro(porEnviar[Number(boton.dataset.registrar)]);
        });

        tablaEnvios.addEventListener("click", evento => {
            const detalle = evento.target.closest("[data-detalle]");
            const actualizar = evento.target.closest("[data-actualizar]");

            if (detalle) abrirDetalle(detalle.dataset.detalle);
            if (actualizar) abrirActualizacion(envios[Number(actualizar.dataset.actualizar)]);
        });

        buscar.addEventListener("input", retraso(cargarEnvios));
        filtroEstado.addEventListener("change", cargarEnvios);
        soloRetrasados.addEventListener("change", cargarEnvios);
        document.getElementById("btnRecargar").addEventListener("click", () => {
            cargarPorEnviar();
            cargarEnvios();
        });

        cargarPorEnviar();
        cargarEnvios();
    }

    // ================================================================
    // VALIDACIÓN DE ENTREGAS
    // ================================================================

    function iniciarEntregas() {
        const contenedor = document.getElementById("tablaEntregas");
        const filtro = document.getElementById("filtroEntregas");
        let entregas = [];

        async function cargar() {
            contenedor.innerHTML = '<div class="cx-cargando">Cargando entregas...</div>';

            try {
                const resultado = await C.api(`${API}/entregas?filtro=${encodeURIComponent(filtro.value)}`, { cache: "no-store" });
                entregas = resultado.datos || [];

                contenedor.innerHTML = tabla(
                    ["Pedido", "Cliente", "Guía", "Estado del envío", "Recepción", "Observaciones", "Acción"],
                    entregas.map((e, i) => `
                        <tr>
                            <td><strong>#${Number(e.id_pedido)}</strong></td>
                            <td>${C.escapar(e.cliente_nombre)}<br><small>${C.escapar(direccionTexto(e))}</small></td>
                            <td>${C.escapar(e.paqueteria || "—")}<br><span class="log-mono">${C.escapar(e.num_guia || "—")}</span></td>
                            <td>${C.estado(e.estado)}</td>
                            <td>${e.validado
                                ? `${C.estado("validada")}<br><strong>${C.escapar(e.recibido_por)}</strong><br><small>${C.fecha(e.fecha_entrega_real, true)} · ${C.escapar(e.validado_por || "")}</small>`
                                : (e.confirmado_cliente ? `${C.estado("confirmada_cliente")}<br><small>${C.fecha(e.fecha_confirmacion_cliente, true)}</small>` : '<small>Pendiente de validar</small>')}</td>
                            <td><small>${C.escapar(e.observaciones_entrega || e.comentario_cliente || "—")}</small></td>
                            <td>${e.validado ? "" : `<button type="button" class="cx-btn cx-btn-primario cx-btn-chico" data-validar="${i}">Validar entrega</button>`}</td>
                        </tr>`),
                    filtro.value === "validadas" ? "Todavía no hay entregas validadas." : "No hay entregas pendientes de validar."
                );
            } catch (error) {
                errorCarga(contenedor, error);
            }
        }

        function abrirValidacion(envio) {
            const ventana = C.dialogo(`
                <h3>Validar entrega del pedido #${Number(envio.id_pedido)}</h3>
                <p class="log-sub">${C.escapar(envio.paqueteria || "")} · guía <span class="log-mono">${C.escapar(envio.num_guia || "—")}</span></p>
                <form class="cx-form" novalidate style="margin-top:14px">
                    <div class="cx-campo">
                        <label for="vRecibio">¿Quién recibió el paquete? *</label>
                        <input id="vRecibio" name="recibido_por" maxlength="150" required value="${C.escapar(envio.cliente_nombre || "")}">
                    </div>
                    <div class="cx-campo">
                        <label for="vFecha">Fecha y hora de recepción *</label>
                        <input type="datetime-local" id="vFecha" name="fecha_recepcion" required value="${C.fechaParaInput(new Date().toISOString(), true)}">
                    </div>
                    <div class="cx-campo cx-campo-completo">
                        <label for="vEvidencia">Evidencia o firma (folio de la paquetería, nombre en la firma, etc.)</label>
                        <input id="vEvidencia" name="firma_evidencia" maxlength="255">
                    </div>
                    <div class="cx-campo cx-campo-completo">
                        <label for="vObs">Observaciones (visibles para el cliente)</label>
                        <textarea id="vObs" name="observaciones" maxlength="500"></textarea>
                    </div>
                    <p class="cx-mensaje cx-campo-completo" role="alert"></p>
                    <div class="cx-form-acciones">
                        <button type="button" class="cx-btn cx-btn-secundario" data-cerrar>Cancelar</button>
                        <button type="submit" class="cx-btn cx-btn-primario">Confirmar entrega</button>
                    </div>
                </form>`, { ancho: 640 });

            const formulario = ventana.querySelector("form");
            ventana.querySelector("[data-cerrar]").addEventListener("click", () => ventana.cerrar());

            formulario.addEventListener("submit", evento => {
                evento.preventDefault();
                const boton = formulario.querySelector('button[type="submit"]');

                enviarFormulario(formulario, boton, async () => {
                    const datos = Object.fromEntries(new FormData(formulario).entries());
                    const resultado = await C.api(`${API}/envios/${envio.id}/entregar`, { method: "POST", body: datos });
                    ventana.cerrar();
                    C.aviso(resultado.mensaje, "exito");
                    await cargar();
                });
            });
        }

        contenedor.addEventListener("click", evento => {
            const boton = evento.target.closest("[data-validar]");
            if (boton) abrirValidacion(entregas[Number(boton.dataset.validar)]);
        });

        filtro.addEventListener("change", cargar);
        document.getElementById("btnRecargar").addEventListener("click", cargar);
        cargar();
    }

    // ================================================================
    // GARANTÍAS
    // ================================================================

    const TRANSICIONES_GARANTIA = {
        pendiente: ["en_revision", "aprobada", "rechazada"],
        en_revision: ["aprobada", "rechazada"],
        aprobada: ["resuelta"],
        rechazada: [],
        resuelta: []
    };

    function iniciarGarantias() {
        const contenedor = document.getElementById("tablaSolicitudes");
        const buscar = document.getElementById("buscar");
        const filtroEstado = document.getElementById("filtroEstado");
        let solicitudes = [];

        async function cargar() {
            const parametros = new URLSearchParams();
            if (buscar.value.trim()) parametros.set("q", buscar.value.trim());
            if (filtroEstado.value) parametros.set("estado", filtroEstado.value);

            try {
                const resultado = await C.api(`${API}/garantias?${parametros}`, { cache: "no-store" });
                solicitudes = resultado.datos || [];

                if (!buscar.value.trim() && !filtroEstado.value) {
                    const contar = estado => solicitudes.filter(s => s.estado === estado).length;
                    document.getElementById("statPendiente").textContent = contar("pendiente");
                    document.getElementById("statRevision").textContent = contar("en_revision");
                    document.getElementById("statAprobada").textContent = contar("aprobada");
                    document.getElementById("statRechazada").textContent = contar("rechazada");
                    document.getElementById("statResuelta").textContent = contar("resuelta");
                }

                contenedor.innerHTML = tabla(
                    ["Folio", "Pedido", "Cliente", "Producto", "Fecha de compra", "Motivo", "Estado", "Gestionó", "Acción"],
                    solicitudes.map((s, i) => `
                        <tr>
                            <td><strong class="log-mono">${C.escapar(s.folio || `#${s.id}`)}</strong><br><small>${C.fecha(s.fecha_solicitud)}</small></td>
                            <td>#${Number(s.id_pedido)}</td>
                            <td>${C.escapar(s.cliente_nombre)}</td>
                            <td>${C.escapar(s.producto)}</td>
                            <td>${C.fecha(s.fecha_compra)}</td>
                            <td>${C.escapar(s.motivo)}</td>
                            <td>${C.estado(s.estado)}</td>
                            <td><small>${C.escapar(s.gestionado_por || "—")}</small></td>
                            <td><button type="button" class="cx-btn cx-btn-azul cx-btn-chico" data-gestionar="${i}">Revisar</button></td>
                        </tr>`),
                    "No hay solicitudes de garantía."
                );
            } catch (error) {
                errorCarga(contenedor, error);
            }
        }

        async function abrir(solicitud) {
            const ventana = C.dialogo('<div class="cx-cargando">Cargando solicitud...</div>', { ancho: 760 });

            try {
                const { datos: g } = await C.api(`${API}/garantias/${solicitud.id}`, { cache: "no-store" });
                const permitidos = (TRANSICIONES_GARANTIA[g.estado] || [])
                    .filter(estado => esAdmin || estado === "en_revision");

                ventana.querySelector(".cx-modal").innerHTML = `
                    <button type="button" class="cx-modal-cerrar" aria-label="Cerrar">&times;</button>
                    <h3>Garantía ${C.escapar(g.folio || `#${g.id}`)}</h3>
                    <p>${C.estado(g.estado)}</p>

                    <div class="log-detalle-grid">
                        <div><span>Pedido</span><strong>#${Number(g.id_pedido)}</strong></div>
                        <div><span>Producto</span><strong>${C.escapar(g.producto)}</strong></div>
                        <div><span>Cliente</span><strong>${C.escapar(g.cliente_nombre)}</strong></div>
                        <div><span>Correo</span><strong>${C.escapar(g.cliente_correo || "—")}</strong></div>
                        <div><span>Fecha de compra</span><strong>${C.fecha(g.fecha_compra)}</strong></div>
                        <div><span>Solicitud</span><strong>${C.fecha(g.fecha_solicitud, true)}</strong></div>
                        <div><span>Motivo</span><strong>${C.escapar(g.motivo)}</strong></div>
                        <div><span>Gestionó</span><strong>${C.escapar(g.gestionado_por || "—")}</strong></div>
                    </div>

                    <div class="cx-mensaje cx-mensaje-info"><strong>Descripción del cliente:</strong><br>${C.escapar(g.descripcion || "—")}</div>
                    ${g.resolucion ? `<div class="cx-mensaje cx-mensaje-exito" style="margin-top:10px"><strong>Resolución:</strong><br>${C.escapar(g.resolucion)}</div>` : ""}
                    ${g.tiene_evidencia ? `<p style="margin-top:10px"><button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-evidencia>Ver fotografía del cliente</button></p>` : ""}

                    <div class="log-seccion-modal">
                        <h4>Historial</h4>
                        ${historialHTML(g.historial, "estado_nuevo")}
                    </div>

                    ${permitidos.length ? `
                        <div class="log-seccion-modal">
                            <h4>Registrar resolución</h4>
                            <form class="cx-form" novalidate>
                                <div class="cx-campo">
                                    <label for="gEstado">Nuevo estado *</label>
                                    <select id="gEstado" name="estado">${permitidos.map(e => `<option value="${e}">${C.escapar(C.etiquetaEstado(e))}</option>`).join("")}</select>
                                </div>
                                <div class="cx-campo cx-campo-completo">
                                    <label for="gResolucion">Resolución para el cliente (obligatoria al rechazar o resolver)</label>
                                    <textarea id="gResolucion" name="resolucion" maxlength="255">${C.escapar(g.resolucion || "")}</textarea>
                                </div>
                                <div class="cx-campo cx-campo-completo">
                                    <label for="gComentario">Comentario interno</label>
                                    <input id="gComentario" name="comentario" maxlength="500">
                                </div>
                                <p class="cx-mensaje cx-campo-completo" role="alert"></p>
                                <div class="cx-form-acciones">
                                    <button type="submit" class="cx-btn cx-btn-primario">Guardar</button>
                                </div>
                            </form>
                        </div>` : `<p class="log-sub" style="margin-top:14px">${g.estado === "rechazada" || g.estado === "resuelta" ? "La solicitud está cerrada." : "Solo un administrador puede continuar con esta solicitud."}</p>`}`;

                ventana.querySelector("[data-evidencia]")?.addEventListener("click", () => verEvidencia("garantias", g.id));

                const formulario = ventana.querySelector("form");

                formulario?.addEventListener("submit", evento => {
                    evento.preventDefault();
                    const boton = formulario.querySelector('button[type="submit"]');

                    enviarFormulario(formulario, boton, async () => {
                        const datos = Object.fromEntries(new FormData(formulario).entries());
                        const resultado = await C.api(`${API}/garantias/${g.id}`, { method: "PATCH", body: datos });
                        ventana.cerrar();
                        C.aviso(resultado.mensaje, "exito");
                        await cargar();
                    });
                });
            } catch (error) {
                ventana.querySelector(".cx-modal").innerHTML = `
                    <button type="button" class="cx-modal-cerrar" aria-label="Cerrar">&times;</button>
                    <div class="cx-vacio"><strong>No se pudo cargar</strong>${C.escapar(error.message)}</div>`;
            }
        }

        contenedor.addEventListener("click", evento => {
            const boton = evento.target.closest("[data-gestionar]");
            if (boton) abrir(solicitudes[Number(boton.dataset.gestionar)]);
        });

        buscar.addEventListener("input", retraso(cargar));
        filtroEstado.addEventListener("change", cargar);
        document.getElementById("btnRecargar").addEventListener("click", cargar);
        cargar();
    }

    // ================================================================
    // DEVOLUCIONES
    // ================================================================

    const ACCIONES_DEVOLUCION = {
        pendiente: ["revisar", "aprobar", "rechazar"],
        en_revision: ["aprobar", "rechazar"],
        aprobada: ["en_proceso", "recibir"],
        en_proceso: ["recibir"],
        producto_recibido: ["resolver", "completar"],
        reembolso_en_proceso: ["completar"],
        completada: [],
        rechazada: []
    };

    const ACCIONES_SOLO_ADMIN = ["aprobar", "rechazar", "resolver", "completar"];

    const NOMBRES_ACCION = {
        revisar: "Tomar en revisión",
        aprobar: "Aprobar devolución",
        rechazar: "Rechazar",
        en_proceso: "Marcar en proceso (cliente envió)",
        recibir: "Registrar recepción del producto",
        resolver: "Iniciar reembolso / reemplazo",
        completar: "Completar devolución",
        reintegrar: "Reintegrar al inventario"
    };

    function camposAccion(accion, d) {
        const maximoReembolso = Number(d.precio_unitario || 0) * Number(d.cantidad_recibida || d.cantidad);

        switch (accion) {
            case "aprobar":
                return `
                    <div class="cx-campo cx-campo-completo">
                        <label for="dInstrucciones">Instrucciones de devolución para el cliente *</label>
                        <textarea id="dInstrucciones" name="instrucciones" maxlength="2000" required>Empaca el producto con todas sus piezas y envíalo a: CUBEX, Los Mochis, Sinaloa. Incluye tu folio ${C.escapar(d.folio || "")} dentro del paquete.</textarea>
                    </div>`;
            case "rechazar":
                return `
                    <div class="cx-campo cx-campo-completo">
                        <label for="dObs">Motivo del rechazo (visible para el cliente) *</label>
                        <textarea id="dObs" name="observaciones" maxlength="500" required></textarea>
                    </div>`;
            case "recibir":
                return `
                    <div class="cx-campo">
                        <label for="dCantidad">Cantidad recibida *</label>
                        <input type="number" id="dCantidad" name="cantidad_recibida" min="1" max="${Number(d.cantidad)}" value="${Number(d.cantidad)}" required>
                    </div>
                    <div class="cx-campo">
                        <label for="dCondicion">Condición del producto *</label>
                        <select id="dCondicion" name="condicion_producto" required>
                            <option value="">Selecciona</option>
                            <option value="vendible">En buen estado (vuelve al inventario)</option>
                            <option value="danado">Dañado (no se reintegra)</option>
                            <option value="no_apto">No apto para venta (no se reintegra)</option>
                        </select>
                    </div>
                    <div class="cx-campo cx-campo-completo">
                        <label for="dObs">Observaciones de la revisión</label>
                        <textarea id="dObs" name="observaciones" maxlength="500"></textarea>
                    </div>`;
            case "resolver":
                return `
                    <div class="cx-campo">
                        <label for="dTipo">Resolución *</label>
                        <select id="dTipo" name="tipo_resolucion" required>
                            <option value="reembolso" ${d.preferencia !== "reemplazo" ? "selected" : ""}>Reembolso</option>
                            <option value="reemplazo" ${d.preferencia === "reemplazo" ? "selected" : ""}>Reemplazo</option>
                        </select>
                    </div>`;
            case "completar":
                return `
                    <div class="cx-campo">
                        <label for="dTipo">Resolución *</label>
                        <select id="dTipo" name="tipo_resolucion" required>
                            <option value="reembolso" ${(d.tipo_resolucion || d.preferencia) !== "reemplazo" ? "selected" : ""}>Reembolso</option>
                            <option value="reemplazo" ${(d.tipo_resolucion || d.preferencia) === "reemplazo" ? "selected" : ""}>Reemplazo</option>
                        </select>
                    </div>
                    <div class="cx-campo">
                        <label for="dMonto">Monto reembolsado (solo reembolso)</label>
                        <input type="number" id="dMonto" name="monto_reembolso" min="0.01" step="0.01" max="${maximoReembolso.toFixed(2)}" value="${maximoReembolso.toFixed(2)}">
                        <span class="cx-ayuda">Máximo ${C.moneda(maximoReembolso)}.</span>
                    </div>
                    <div class="cx-campo cx-campo-completo">
                        <label for="dReferencia">Referencia (transacción o guía del reemplazo)</label>
                        <input id="dReferencia" name="referencia" maxlength="120">
                    </div>`;
            default:
                return "";
        }
    }

    function iniciarDevoluciones() {
        const contenedor = document.getElementById("tablaSolicitudes");
        const buscar = document.getElementById("buscar");
        const filtroEstado = document.getElementById("filtroEstado");
        let solicitudes = [];

        async function cargar() {
            const parametros = new URLSearchParams();
            if (buscar.value.trim()) parametros.set("q", buscar.value.trim());
            if (filtroEstado.value) parametros.set("estado", filtroEstado.value);

            try {
                const resultado = await C.api(`${API}/devoluciones?${parametros}`, { cache: "no-store" });
                solicitudes = resultado.datos || [];

                if (!buscar.value.trim() && !filtroEstado.value) {
                    const contar = (...estados) => solicitudes.filter(s => estados.includes(s.estado)).length;
                    document.getElementById("statPorRevisar").textContent = contar("pendiente", "en_revision");
                    document.getElementById("statEnCurso").textContent = contar("aprobada", "en_proceso");
                    document.getElementById("statRecibidas").textContent = contar("producto_recibido", "reembolso_en_proceso");
                    document.getElementById("statCompletadas").textContent = contar("completada");
                    document.getElementById("statRechazadas").textContent = contar("rechazada");
                }

                contenedor.innerHTML = tabla(
                    ["Folio", "Pedido", "Cliente", "Producto", "Cantidad", "Motivo", "Estado", "Autorizó", "Acción"],
                    solicitudes.map((s, i) => `
                        <tr>
                            <td><strong class="log-mono">${C.escapar(s.folio || `#${s.id}`)}</strong><br><small>${C.fecha(s.fecha)}</small></td>
                            <td>#${Number(s.id_pedido)}</td>
                            <td>${C.escapar(s.cliente_nombre)}</td>
                            <td>${C.escapar(s.producto)}</td>
                            <td>${Number(s.cantidad)} de ${Number(s.cantidad_comprada || s.cantidad)}</td>
                            <td>${C.escapar(s.motivo)}</td>
                            <td>${C.estado(s.estado)}${s.condicion_producto === "vendible" && Number(s.cantidad_reintegrada) === 0 ? '<br><span class="log-insignia">Reintegro pendiente</span>' : ""}</td>
                            <td><small>${C.escapar(s.autorizado_por || "—")}</small></td>
                            <td><button type="button" class="cx-btn cx-btn-azul cx-btn-chico" data-gestionar="${i}">Revisar</button></td>
                        </tr>`),
                    "No hay solicitudes de devolución."
                );
            } catch (error) {
                errorCarga(contenedor, error);
            }
        }

        async function abrir(solicitud) {
            const ventana = C.dialogo('<div class="cx-cargando">Cargando solicitud...</div>', { ancho: 820 });

            try {
                const { datos: d } = await C.api(`${API}/devoluciones/${solicitud.id}`, { cache: "no-store" });

                const acciones = (ACCIONES_DEVOLUCION[d.estado] || []).filter(a => esAdmin || !ACCIONES_SOLO_ADMIN.includes(a));

                if (d.condicion_producto === "vendible" && Number(d.cantidad_reintegrada) === 0 && d.estado !== "rechazada") {
                    acciones.push("reintegrar");
                }

                const condiciones = { vendible: "En buen estado", danado: "Dañado", no_apto: "No apto para venta" };

                ventana.querySelector(".cx-modal").innerHTML = `
                    <button type="button" class="cx-modal-cerrar" aria-label="Cerrar">&times;</button>
                    <h3>Devolución ${C.escapar(d.folio || `#${d.id}`)}</h3>
                    <p>${C.estado(d.estado)}</p>

                    <div class="log-detalle-grid">
                        <div><span>Pedido</span><strong>#${Number(d.id_pedido)}</strong></div>
                        <div><span>Producto</span><strong>${C.escapar(d.producto)}</strong></div>
                        <div><span>Cantidad solicitada</span><strong>${Number(d.cantidad)} de ${Number(d.cantidad_comprada || d.cantidad)} compradas</strong></div>
                        <div><span>Precio unitario</span><strong>${C.moneda(d.precio_unitario)}</strong></div>
                        <div><span>Cliente</span><strong>${C.escapar(d.cliente_nombre)}</strong></div>
                        <div><span>Correo</span><strong>${C.escapar(d.cliente_correo || "—")}</strong></div>
                        <div><span>Motivo</span><strong>${C.escapar(d.motivo)}</strong></div>
                        <div><span>Prefiere</span><strong>${d.preferencia === "reemplazo" ? "Reemplazo" : "Reembolso"}</strong></div>
                        <div><span>Autorizó / rechazó</span><strong>${C.escapar(d.autorizado_por || "—")} ${d.fecha_autorizacion ? `· ${C.fecha(d.fecha_autorizacion, true)}` : ""}</strong></div>
                        <div><span>Recepción</span><strong>${d.fecha_recepcion ? `${Number(d.cantidad_recibida)} u. · ${C.escapar(condiciones[d.condicion_producto] || "")} · ${C.escapar(d.recibido_por || "")}` : "—"}</strong></div>
                        <div><span>Reintegrado al inventario</span><strong>${Number(d.cantidad_reintegrada || 0)} u.</strong></div>
                        <div><span>Resolución</span><strong>${d.tipo_resolucion ? `${d.tipo_resolucion === "reemplazo" ? "Reemplazo" : "Reembolso"}${d.monto_reembolso ? ` · ${C.moneda(d.monto_reembolso)}` : ""}${d.referencia_resolucion ? ` · ${C.escapar(d.referencia_resolucion)}` : ""}` : "—"}</strong></div>
                    </div>

                    <div class="cx-mensaje cx-mensaje-info"><strong>Descripción del cliente:</strong><br>${C.escapar(d.descripcion || "—")}</div>
                    ${d.instrucciones ? `<div class="cx-mensaje cx-mensaje-exito" style="margin-top:10px"><strong>Instrucciones enviadas:</strong><br>${C.escapar(d.instrucciones)}</div>` : ""}
                    ${d.observaciones ? `<div class="cx-mensaje cx-mensaje-advertencia" style="margin-top:10px"><strong>Observaciones:</strong><br>${C.escapar(d.observaciones)}</div>` : ""}
                    ${d.tiene_evidencia ? `<p style="margin-top:10px"><button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-evidencia>Ver evidencia del cliente</button></p>` : ""}

                    <div class="log-seccion-modal">
                        <h4>Historial</h4>
                        ${historialHTML(d.historial, "estado_nuevo")}
                    </div>

                    ${acciones.length ? `
                        <div class="log-seccion-modal">
                            <h4>Siguiente paso</h4>
                            <div class="cx-campo" style="margin-bottom:12px">
                                <label for="dAccion">Acción</label>
                                <select id="dAccion">${acciones.map(a => `<option value="${a}">${C.escapar(NOMBRES_ACCION[a])}</option>`).join("")}</select>
                            </div>
                            <form class="cx-form" novalidate>
                                <div class="cx-campos-accion" style="display:contents"></div>
                                <div class="cx-campo cx-campo-completo">
                                    <label for="dComentario">Comentario para el historial</label>
                                    <input id="dComentario" name="comentario" maxlength="500">
                                </div>
                                <p class="cx-mensaje cx-campo-completo" role="alert"></p>
                                <div class="cx-form-acciones">
                                    <button type="submit" class="cx-btn cx-btn-primario">Aplicar</button>
                                </div>
                            </form>
                        </div>` : `<p class="log-sub" style="margin-top:14px">${["completada", "rechazada"].includes(d.estado) ? "La solicitud está cerrada." : "Solo un administrador puede continuar con esta solicitud."}</p>`}`;

                ventana.querySelector("[data-evidencia]")?.addEventListener("click", () => verEvidencia("devoluciones", d.id));

                const selector = ventana.querySelector("#dAccion");
                const formulario = ventana.querySelector("form");

                if (selector && formulario) {
                    const campos = formulario.querySelector(".cx-campos-accion");
                    const pintarCampos = () => { campos.innerHTML = camposAccion(selector.value, d); };
                    selector.addEventListener("change", pintarCampos);
                    pintarCampos();

                    formulario.addEventListener("submit", evento => {
                        evento.preventDefault();
                        const boton = formulario.querySelector('button[type="submit"]');

                        enviarFormulario(formulario, boton, async () => {
                            const datos = { ...Object.fromEntries(new FormData(formulario).entries()), accion: selector.value };
                            const resultado = await C.api(`${API}/devoluciones/${d.id}`, { method: "PATCH", body: datos });
                            ventana.cerrar();
                            C.aviso(resultado.mensaje, "exito", 6000);
                            if (resultado.aviso) C.aviso(resultado.aviso, "advertencia", 10000);
                            await cargar();
                        });
                    });
                }
            } catch (error) {
                ventana.querySelector(".cx-modal").innerHTML = `
                    <button type="button" class="cx-modal-cerrar" aria-label="Cerrar">&times;</button>
                    <div class="cx-vacio"><strong>No se pudo cargar</strong>${C.escapar(error.message)}</div>`;
            }
        }

        contenedor.addEventListener("click", evento => {
            const boton = evento.target.closest("[data-gestionar]");
            if (boton) abrir(solicitudes[Number(boton.dataset.gestionar)]);
        });

        buscar.addEventListener("input", retraso(cargar));
        filtroEstado.addEventListener("change", cargar);
        document.getElementById("btnRecargar").addEventListener("click", cargar);
        cargar();
    }

    // ------------------------------------------------------------
    // ARRANQUE
    // ------------------------------------------------------------

    const modulos = {
        envios: iniciarEnvios,
        entregas: iniciarEntregas,
        garantias: iniciarGarantias,
        devoluciones: iniciarDevoluciones
    };

    if (modulos[MODULO]) {
        modulos[MODULO]();
    }

    C.informarAltura();
})();
