/* =====================================================================
   CUBEX - MI CUENTA DEL CLIENTE
   Perfil, mis pedidos, mis envíos (rastreo), garantías y devoluciones.
   Todos los datos provienen de los microservicios (MySQL); cada
   consulta usa el token del cliente, así el servidor solo devuelve lo
   que le pertenece.
   ===================================================================== */

(function () {
    "use strict";

    const { API, RASTREO_PAQUETERIAS } = CUBEX_CONFIG;
    const C = window.Cubex;

    const API_LOGIN = API.LOGIN;
    const API_PEDIDOS = API.PEDIDOS;
    const API_LOGISTICA = API.LOGISTICA;

    const PASOS_ENVIO = ["pendiente", "preparando", "en_transito", "en_reparto", "entregado"];
    const NOMBRES_PASOS = ["Pendiente", "Preparando", "En tránsito", "En reparto", "Entregado"];

    const estadoPagina = {
        pedidos: [],
        envios: [],
        elegibles: [],
        catalogos: null,
        cargado: {}
    };

    // ------------------------------------------------------------
    // SESIÓN
    // ------------------------------------------------------------

    const token = C.token();
    let usuario = C.usuario() || {};

    if (!token) {
        window.location.replace("login.html");
        return;
    }

    if (usuario.rol && usuario.rol !== "CLIENTE") {
        // El personal tiene su propio panel.
        window.location.replace(usuario.rol === "ADMIN" ? "admin.html" : "empleado.html");
        return;
    }

    function manejarSesionExpirada(error) {
        if (error && error.status === 401) {
            C.aviso("Tu sesión expiró. Inicia sesión nuevamente.", "error");
            setTimeout(() => C.cerrarSesion("login.html"), 1800);
            return true;
        }

        return false;
    }

    document.getElementById("btnCerrarSesion").addEventListener("click", async () => {
        const ok = await C.confirmar({
            titulo: "¿Cerrar sesión?",
            mensaje: "Tendrás que iniciar sesión nuevamente para comprar.",
            textoConfirmar: "Cerrar sesión"
        });

        if (ok) C.cerrarSesion("login.html");
    });

    // ------------------------------------------------------------
    // PESTAÑAS
    // ------------------------------------------------------------

    const pestanas = [...document.querySelectorAll(".cx-pestana")];

    function mostrarPanel(nombre) {
        const destino = pestanas.some(p => p.dataset.panel === nombre) ? nombre : "perfil";

        pestanas.forEach(pestana => {
            const activa = pestana.dataset.panel === destino;
            pestana.setAttribute("aria-selected", String(activa));
            pestana.tabIndex = activa ? 0 : -1;
            document.getElementById(`panel-${pestana.dataset.panel}`).hidden = !activa;
        });

        if (window.location.hash !== `#${destino}`) {
            history.replaceState(null, "", `#${destino}`);
        }

        cargarPanel(destino);
    }

    pestanas.forEach((pestana, indice) => {
        pestana.addEventListener("click", () => mostrarPanel(pestana.dataset.panel));

        pestana.addEventListener("keydown", evento => {
            if (evento.key !== "ArrowRight" && evento.key !== "ArrowLeft") return;

            const siguiente = evento.key === "ArrowRight"
                ? pestanas[(indice + 1) % pestanas.length]
                : pestanas[(indice - 1 + pestanas.length) % pestanas.length];

            siguiente.focus();
            mostrarPanel(siguiente.dataset.panel);
        });
    });

    window.addEventListener("hashchange", () => mostrarPanel(window.location.hash.slice(1)));

    document.querySelectorAll("[data-recargar]").forEach(boton => {
        boton.addEventListener("click", () => {
            estadoPagina.cargado[boton.dataset.recargar] = false;
            cargarPanel(boton.dataset.recargar, true);
        });
    });

    function cargarPanel(nombre, forzar = false) {
        if (estadoPagina.cargado[nombre] && !forzar) return;

        estadoPagina.cargado[nombre] = true;

        if (nombre === "perfil") return cargarPerfil();
        if (nombre === "pedidos") return cargarPedidos();
        if (nombre === "envios") return cargarEnvios();
        if (nombre === "garantias") return cargarGarantias();
        if (nombre === "devoluciones") return cargarDevoluciones();
    }

    // ------------------------------------------------------------
    // PERFIL
    // ------------------------------------------------------------

    function pintarUsuario() {
        const nombre = usuario.nombreCompleto || usuario.nombreUsuario || "Cliente";

        document.getElementById("saludoCliente").textContent = `Hola, ${nombre.split(" ")[0]}`;
        document.getElementById("avatarCliente").textContent = nombre.trim().charAt(0).toUpperCase() || "C";
        document.getElementById("nombreUsuario").textContent = usuario.nombreUsuario || "No disponible";
        document.getElementById("nombreCompleto").textContent = usuario.nombreCompleto || "No registrado";
        document.getElementById("email").textContent = usuario.email || "No registrado";
        document.getElementById("rol").textContent = usuario.rol || "CLIENTE";
    }

    async function cargarPerfil() {
        pintarUsuario();

        try {
            const resultado = await C.api(`${API_LOGIN}/auth/perfil`);
            usuario = { ...usuario, ...(resultado.datos || {}) };
            sessionStorage.setItem(CUBEX_CONFIG.CLAVE_USUARIO, JSON.stringify(usuario));
            pintarUsuario();
        } catch (error) {
            if (manejarSesionExpirada(error)) return;

            const mensaje = document.getElementById("mensaje");
            mensaje.className = "cx-mensaje cx-mensaje-advertencia";
            mensaje.textContent = "No se pudo actualizar tu información desde el servidor.";
        }

        actualizarResumen();
    }

    async function actualizarResumen() {
        try {
            if (!estadoPagina.cargado.pedidos) {
                estadoPagina.cargado.pedidos = true;
                await cargarPedidos(false);
            }

            if (!estadoPagina.cargado.envios) {
                estadoPagina.cargado.envios = true;
                await cargarEnvios(false);
            }
        } catch {
            // Los paneles muestran sus propios errores.
        }

        const pedidos = estadoPagina.pedidos;
        const envios = estadoPagina.envios;

        document.getElementById("resPedidos").textContent = pedidos.length;
        document.getElementById("resPendientes").textContent =
            pedidos.filter(p => String(p.estado).toLowerCase() === "pendiente").length;
        document.getElementById("resEnCamino").textContent =
            envios.filter(e => ["en_transito", "en_reparto"].includes(e.estado_envio)).length;
        document.getElementById("resEntregados").textContent =
            envios.filter(e => e.estado_envio === "entregado").length;
    }

    // ------------------------------------------------------------
    // MIS PEDIDOS
    // ------------------------------------------------------------

    const listaPedidos = document.getElementById("listaPedidos");
    const filtroPedidos = document.getElementById("filtroPedidos");

    async function cargarPedidos(pintar = true) {
        if (pintar) listaPedidos.innerHTML = '<div class="cx-cargando">Cargando tus pedidos...</div>';

        try {
            const resultado = await C.api(`${API_PEDIDOS}/mis-pedidos`, { cache: "no-store" });
            estadoPagina.pedidos = Array.isArray(resultado.datos) ? resultado.datos : [];
            pintarPedidos();
        } catch (error) {
            if (manejarSesionExpirada(error)) return;

            listaPedidos.innerHTML = `
                <div class="cx-vacio">
                    <strong>No pudimos cargar tus pedidos</strong>
                    ${C.escapar(error.message)}
                </div>`;
        }
    }

    function tablaProductos(productos) {
        if (!productos || !productos.length) {
            return '<p class="cuenta-texto">Sin productos registrados.</p>';
        }

        return `
            <table class="cuenta-productos">
                <thead>
                    <tr>
                        <th>Producto</th>
                        <th class="numero">Cantidad</th>
                        <th class="numero">Precio</th>
                        <th class="numero">Subtotal</th>
                    </tr>
                </thead>
                <tbody>
                    ${productos.map(p => `
                        <tr>
                            <td>
                                <span class="cuenta-producto-nombre">
                                    ${p.imagen ? `<img src="${C.escapar(C.urlImagen(p.imagen))}" alt="" loading="lazy">` : ""}
                                    ${C.escapar(p.nombre)}
                                </span>
                            </td>
                            <td class="numero">${Number(p.cantidad)}</td>
                            <td class="numero">${C.moneda(p.precio_unitario)}</td>
                            <td class="numero">${C.moneda(p.subtotal ?? p.cantidad * p.precio_unitario)}</td>
                        </tr>`).join("")}
                </tbody>
            </table>`;
    }

    function pintarPedidos() {
        const filtro = filtroPedidos.value;
        const pedidos = estadoPagina.pedidos.filter(p =>
            !filtro || String(p.estado).toLowerCase() === filtro
        );

        if (!pedidos.length) {
            listaPedidos.innerHTML = `
                <div class="cx-vacio">
                    <strong>${estadoPagina.pedidos.length ? "No hay pedidos con ese estado" : "Todavía no tienes pedidos"}</strong>
                    ${estadoPagina.pedidos.length ? "" : '<a class="cx-btn cx-btn-primario" href="index.html#productos">Explorar cubos</a>'}
                </div>`;
            return;
        }

        listaPedidos.innerHTML = pedidos.map(pedido => {
            const estado = String(pedido.estado || "").toLowerCase();
            const direccion = [pedido.calle_numero, pedido.colonia, pedido.ciudad, pedido.codigo_postal]
                .filter(Boolean).join(", ");

            return `
                <article class="cuenta-item">
                    <div class="cuenta-item-encabezado">
                        <div>
                            <h3>Pedido #${Number(pedido.id)}</h3>
                            <small>${C.fecha(pedido.fecha, true)}</small>
                        </div>
                        ${C.estado(estado)}
                    </div>

                    <div class="cuenta-item-datos">
                        <div><span>Total</span><strong>${C.moneda(pedido.total)}</strong></div>
                        <div><span>Artículos</span><strong>${Number(pedido.total_articulos || 0)}</strong></div>
                        <div><span>Entrega en</span><strong>${C.escapar(direccion || "—")}</strong></div>
                        ${estado === "cancelado" && pedido.motivo_cancelacion
                            ? `<div><span>Motivo de cancelación</span><strong>${C.escapar(pedido.motivo_cancelacion)}</strong></div>`
                            : ""}
                    </div>

                    <details class="cuenta-detalle">
                        <summary>Ver productos</summary>
                        ${tablaProductos(pedido.productos)}
                    </details>

                    <div class="cuenta-item-acciones">
                        ${estado === "pendiente" ? `
                            <button type="button" class="cx-btn cx-btn-primario cx-btn-chico" data-pagar="${Number(pedido.id)}">Pagar ahora</button>
                            <button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-cancelar="${Number(pedido.id)}">Cancelar pedido</button>
                        ` : ""}
                        ${estado === "confirmado" ? `
                            <button type="button" class="cx-btn cx-btn-azul cx-btn-chico" data-ver-envio="${Number(pedido.id)}">Rastrear envío</button>
                            <button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-ticket="${Number(pedido.id)}">Descargar ticket</button>
                        ` : ""}
                    </div>
                </article>`;
        }).join("");
    }

    filtroPedidos.addEventListener("change", pintarPedidos);

    listaPedidos.addEventListener("click", async evento => {
        const pagar = evento.target.closest("[data-pagar]");
        const cancelar = evento.target.closest("[data-cancelar]");
        const verEnvio = evento.target.closest("[data-ver-envio]");
        const ticket = evento.target.closest("[data-ticket]");

        if (pagar) {
            sessionStorage.setItem("cubex_pedido_seleccionado", pagar.dataset.pagar);
            window.location.href = "pago.html";
        }

        if (verEnvio) {
            mostrarPanel("envios");
            setTimeout(() => {
                document.getElementById(`envio-pedido-${verEnvio.dataset.verEnvio}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 400);
        }

        if (cancelar) {
            const id = cancelar.dataset.cancelar;
            const ok = await C.confirmar({
                titulo: `¿Cancelar el pedido #${id}?`,
                mensaje: "El pedido aún no se ha pagado. Esta acción no se puede deshacer.",
                textoConfirmar: "Sí, cancelar",
                peligro: true
            });

            if (!ok) return;

            cancelar.disabled = true;

            try {
                await C.api(`${API_PEDIDOS}/${id}/cancelar`, { method: "PATCH" });
                C.aviso(`El pedido #${id} se canceló.`, "exito");
                await cargarPedidos();
            } catch (error) {
                if (!manejarSesionExpirada(error)) C.aviso(error.message, "error");
                cancelar.disabled = false;
            }
        }

        if (ticket) {
            ticket.disabled = true;

            try {
                const respuesta = await fetch(`${API.TICKETS}/api/tickets/${ticket.dataset.ticket}`);

                if (!respuesta.ok) {
                    const datos = await respuesta.json().catch(() => ({}));
                    throw new Error(datos.detail || "No se pudo generar el ticket.");
                }

                const archivo = await respuesta.blob();
                const url = URL.createObjectURL(archivo);
                const enlace = document.createElement("a");
                enlace.href = url;
                enlace.download = `CUBEX-ticket-${ticket.dataset.ticket}.pdf`;
                document.body.appendChild(enlace);
                enlace.click();
                enlace.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (error) {
                C.aviso(
                    error.message === "Failed to fetch"
                        ? "El servicio de tickets no está disponible."
                        : error.message,
                    "error"
                );
            } finally {
                ticket.disabled = false;
            }
        }
    });

    // ------------------------------------------------------------
    // MIS ENVÍOS
    // ------------------------------------------------------------

    const listaEnvios = document.getElementById("listaEnvios");

    async function cargarEnvios(pintar = true) {
        if (pintar) listaEnvios.innerHTML = '<div class="cx-cargando">Cargando tus envíos...</div>';

        try {
            const resultado = await C.api(`${API_LOGISTICA}/clientes/mis-envios`, { cache: "no-store" });
            estadoPagina.envios = Array.isArray(resultado.datos) ? resultado.datos : [];
            pintarEnvios();
        } catch (error) {
            if (manejarSesionExpirada(error)) return;

            listaEnvios.innerHTML = `
                <div class="cx-vacio">
                    <strong>No pudimos cargar tus envíos</strong>
                    ${C.escapar(error.message)}
                </div>`;
        }
    }

    function lineaProgreso(estadoEnvio) {
        const estado = estadoEnvio || "pendiente";
        const indice = PASOS_ENVIO.indexOf(estado);
        const clase = ["cancelado", "incidencia"].includes(estado) ? estado : "";

        return `
            <ol class="cx-progreso ${clase}" aria-label="Progreso del envío">
                ${NOMBRES_PASOS.map((nombre, i) => {
                    let estadoPaso = "";
                    if (indice >= 0 && i < indice) estadoPaso = "hecho";
                    if (indice >= 0 && i === indice) estadoPaso = estado === "entregado" ? "hecho actual" : "actual";
                    return `<li class="${estadoPaso}" ${estadoPaso.includes("actual") ? 'aria-current="step"' : ""}>${nombre}</li>`;
                }).join("")}
            </ol>`;
    }

    function enlaceRastreo(paqueteria, guia) {
        if (!paqueteria || !guia) return "";

        const plantilla = RASTREO_PAQUETERIAS[paqueteria];

        if (!plantilla) return "";

        const url = plantilla.replace("{guia}", encodeURIComponent(guia));

        return `<a class="cx-btn cx-btn-azul cx-btn-chico" href="${C.escapar(url)}" target="_blank" rel="noopener noreferrer">Rastrear en ${C.escapar(paqueteria)} ↗</a>`;
    }

    function pintarEnvios() {
        const envios = estadoPagina.envios.filter(e => String(e.estado_pedido).toLowerCase() === "confirmado");

        if (!envios.length) {
            listaEnvios.innerHTML = `
                <div class="cx-vacio">
                    <strong>No tienes envíos todavía</strong>
                    Cuando pagues un pedido aparecerá aquí su seguimiento.
                </div>`;
            return;
        }

        listaEnvios.innerHTML = envios.map(envio => {
            const tieneEnvio = Boolean(envio.id_envio);
            const estado = envio.estado_envio || "pendiente";
            const direccion = [envio.calle_numero, envio.colonia, envio.ciudad, envio.codigo_postal]
                .filter(Boolean).join(", ");

            const puedeConfirmar = tieneEnvio &&
                ["en_reparto", "entregado"].includes(estado) &&
                !envio.confirmado_cliente;

            const historial = (envio.historial || []).slice().reverse();

            return `
                <article class="cuenta-item" id="envio-pedido-${Number(envio.id_pedido)}">
                    <div class="cuenta-item-encabezado">
                        <div>
                            <h3>Pedido #${Number(envio.id_pedido)}</h3>
                            <small>Comprado el ${C.fecha(envio.fecha_pedido)}</small>
                        </div>
                        ${tieneEnvio ? C.estado(estado) : C.estado("pendiente")}
                    </div>

                    ${lineaProgreso(tieneEnvio ? estado : "pendiente")}

                    ${envio.retrasado ? '<p class="cx-mensaje cx-mensaje-advertencia">Tu envío superó la fecha estimada de entrega. Estamos dando seguimiento con la paquetería.</p>' : ""}
                    ${estado === "incidencia" ? '<p class="cx-mensaje cx-mensaje-error">Tu envío tiene una incidencia. Te contactaremos para resolverla.</p>' : ""}

                    <div class="cuenta-item-datos">
                        <div>
                            <span>Paquetería</span>
                            <strong>${tieneEnvio && envio.paqueteria ? C.escapar(envio.paqueteria) : "Pendiente de asignación"}</strong>
                        </div>
                        <div>
                            <span>Número de guía</span>
                            <strong>${tieneEnvio && envio.num_guia
                                ? `<span class="cuenta-guia">${C.escapar(envio.num_guia)}
                                       <button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-copiar="${C.escapar(envio.num_guia)}" aria-label="Copiar número de guía">Copiar</button>
                                   </span>`
                                : "Pendiente de asignación"}</strong>
                        </div>
                        <div><span>Fecha de envío</span><strong>${C.fecha(envio.fecha_envio)}</strong></div>
                        <div><span>Entrega estimada</span><strong>${C.fecha(envio.fecha_estimada_entrega)}</strong></div>
                        <div><span>Dirección de entrega</span><strong>${C.escapar(direccion || "—")}</strong></div>
                    </div>

                    ${envio.fecha_entrega_real || envio.confirmado_cliente ? `
                        <div class="cuenta-bloque">
                            <h4>Validación de entrega</h4>
                            ${envio.validado ? `
                                <p><strong>Entregado el:</strong> ${C.fecha(envio.fecha_entrega_real, true)}</p>
                                ${envio.recibido_por ? `<p><strong>Recibió:</strong> ${C.escapar(envio.recibido_por)}</p>` : ""}
                                ${envio.nota_entrega ? `<p><strong>Nota:</strong> ${C.escapar(envio.nota_entrega)}</p>` : ""}
                                <p>${C.estado("validada")}</p>
                            ` : '<p>CUBEX está validando la entrega.</p>'}
                            ${envio.confirmado_cliente ? `<p class="cuenta-texto">Confirmaste la recepción el ${C.fecha(envio.fecha_confirmacion_cliente, true)}.</p>` : ""}
                        </div>` : ""}

                    <details class="cuenta-detalle" ${historial.length ? "" : "hidden"}>
                        <summary>Historial de seguimiento (${historial.length})</summary>
                        <ul class="cx-historial" style="margin-top:12px">
                            ${historial.map(h => `
                                <li>
                                    <strong>${C.escapar(C.etiquetaEstado(h.estado))}</strong> · ${C.fecha(h.fecha, true)}
                                    ${h.ubicacion ? ` · ${C.escapar(h.ubicacion)}` : ""}
                                    <br>${C.escapar(h.descripcion || "")}
                                </li>`).join("")}
                        </ul>
                    </details>

                    <details class="cuenta-detalle">
                        <summary>Productos del pedido</summary>
                        ${tablaProductos(envio.productos)}
                    </details>

                    <div class="cuenta-item-acciones">
                        ${enlaceRastreo(envio.paqueteria, envio.num_guia)}
                        ${puedeConfirmar ? `<button type="button" class="cx-btn cx-btn-primario cx-btn-chico" data-confirmar-envio="${Number(envio.id_envio)}">Ya recibí mi pedido</button>` : ""}
                    </div>
                </article>`;
        }).join("");
    }

    listaEnvios.addEventListener("click", async evento => {
        const copiar = evento.target.closest("[data-copiar]");
        const confirmarEnvio = evento.target.closest("[data-confirmar-envio]");

        if (copiar) {
            try {
                await navigator.clipboard.writeText(copiar.dataset.copiar);
                C.aviso("Número de guía copiado.", "info", 2500);
            } catch {
                C.aviso(`Guía: ${copiar.dataset.copiar}`, "info");
            }
        }

        if (confirmarEnvio) {
            const ok = await C.confirmar({
                titulo: "¿Recibiste tu pedido?",
                mensaje: "Confirmarás que el paquete llegó a tus manos.",
                textoConfirmar: "Sí, lo recibí"
            });

            if (!ok) return;

            confirmarEnvio.disabled = true;

            try {
                const resultado = await C.api(
                    `${API_LOGISTICA}/clientes/envios/${confirmarEnvio.dataset.confirmarEnvio}/confirmar-recepcion`,
                    { method: "POST", body: {} }
                );
                C.aviso(resultado.mensaje, "exito");
                await cargarEnvios();
            } catch (error) {
                if (!manejarSesionExpirada(error)) C.aviso(error.message, "error");
                confirmarEnvio.disabled = false;
            }
        }
    });

    // ------------------------------------------------------------
    // POSTVENTA: CATÁLOGOS Y PRODUCTOS ELEGIBLES
    // ------------------------------------------------------------

    async function cargarCatalogos() {
        if (estadoPagina.catalogos) return estadoPagina.catalogos;

        const resultado = await C.api(`${API_LOGISTICA}/postventa/catalogos`);
        estadoPagina.catalogos = resultado.datos;

        document.getElementById("textoPlazoGarantia").textContent =
            `Puedes solicitar garantía hasta ${resultado.datos.dias_garantia} días después de recibir tu pedido.`;
        document.getElementById("textoPlazoDevolucion").textContent =
            `Puedes solicitar la devolución hasta ${resultado.datos.dias_devolucion} días después de recibir tu pedido.`;

        const opciones = lista => '<option value="">Selecciona un motivo</option>' +
            lista.map(m => `<option value="${C.escapar(m)}">${C.escapar(m)}</option>`).join("");

        document.getElementById("garantiaMotivo").innerHTML = opciones(resultado.datos.motivos_garantia);
        document.getElementById("devolucionMotivo").innerHTML = opciones(resultado.datos.motivos_devolucion);

        return estadoPagina.catalogos;
    }

    async function cargarElegibles() {
        const resultado = await C.api(`${API_LOGISTICA}/postventa/elegibles`, { cache: "no-store" });
        estadoPagina.elegibles = Array.isArray(resultado.datos) ? resultado.datos : [];
        pintarSelectoresPostventa();
    }

    function pintarSelectoresPostventa() {
        const elegibles = estadoPagina.elegibles;

        const construir = (campoPuede, campoMotivo) => {
            if (!elegibles.length) {
                return '<option value="">No tienes compras confirmadas</option>';
            }

            return '<option value="">Selecciona un producto</option>' + elegibles.map((item, indice) => {
                const puede = item[campoPuede];
                const texto = `Pedido #${item.id_pedido} · ${item.nombre} (${item.cantidad} u.)`;
                return `<option value="${indice}" ${puede ? "" : "disabled"}>${C.escapar(texto)}${puede ? "" : ` — ${C.escapar(item[campoMotivo])}`}</option>`;
            }).join("");
        };

        document.getElementById("garantiaProducto").innerHTML = construir("puede_garantia", "motivo_no_garantia");
        document.getElementById("devolucionProducto").innerHTML = construir("puede_devolver", "motivo_no_devolucion");
    }

    document.getElementById("devolucionProducto").addEventListener("change", evento => {
        const item = estadoPagina.elegibles[Number(evento.target.value)];
        const cantidad = document.getElementById("devolucionCantidad");
        const ayuda = document.getElementById("ayudaDevolucionProducto");

        if (!item) {
            ayuda.textContent = "";
            return;
        }

        cantidad.max = String(item.cantidad_disponible_devolucion);
        cantidad.value = "1";
        ayuda.textContent = `Puedes devolver hasta ${item.cantidad_disponible_devolucion} unidad(es) de ${item.cantidad} comprada(s).`;
    });

    function enviarConEvidencia(url, campos, archivo) {
        if (archivo) {
            if (archivo.size > 5 * 1024 * 1024) {
                throw new C.ErrorApi("La imagen no puede superar 5 MB.", 400);
            }

            const formulario = new FormData();
            Object.entries(campos).forEach(([clave, valor]) => formulario.append(clave, valor));
            formulario.append("evidencia", archivo);
            return C.api(url, { method: "POST", body: formulario });
        }

        return C.api(url, { method: "POST", body: campos });
    }

    async function verEvidencia(tipo, id) {
        try {
            const respuesta = await fetch(`${API_LOGISTICA}/postventa/evidencias/${tipo}/${id}`);

            if (!respuesta.ok) throw new Error("No se pudo abrir la evidencia.");

            const url = URL.createObjectURL(await respuesta.blob());
            const ventana = C.dialogo(`<h3>Evidencia</h3><img src="${url}" alt="Evidencia enviada" style="max-width:100%;border-radius:10px">`);
            const cerrar = ventana.cerrar;
            ventana.cerrar = () => { URL.revokeObjectURL(url); cerrar(); };
        } catch (error) {
            C.aviso(error.message, "error");
        }
    }

    function historialHTML(historial) {
        if (!historial || !historial.length) return "";

        return `
            <details class="cuenta-detalle">
                <summary>Historial (${historial.length})</summary>
                <ul class="cx-historial" style="margin-top:12px">
                    ${historial.slice().reverse().map(h => `
                        <li><strong>${C.escapar(C.etiquetaEstado(h.estado_nuevo))}</strong> · ${C.fecha(h.fecha, true)}
                        ${h.comentario ? `<br>${C.escapar(h.comentario)}` : ""}</li>`).join("")}
                </ul>
            </details>`;
    }

    // ------------------------------------------------------------
    // MIS GARANTÍAS
    // ------------------------------------------------------------

    const listaGarantias = document.getElementById("listaGarantias");
    const formGarantia = document.getElementById("formGarantia");

    async function cargarGarantias() {
        listaGarantias.innerHTML = '<div class="cx-cargando">Cargando tus garantías...</div>';

        try {
            await cargarCatalogos();
            await cargarElegibles();
            const resultado = await C.api(`${API_LOGISTICA}/garantias/mias`, { cache: "no-store" });
            pintarGarantias(resultado.datos || []);
        } catch (error) {
            if (manejarSesionExpirada(error)) return;

            listaGarantias.innerHTML = `<div class="cx-vacio"><strong>No pudimos cargar tus garantías</strong>${C.escapar(error.message)}</div>`;
        }
    }

    function pintarGarantias(garantias) {
        if (!garantias.length) {
            listaGarantias.innerHTML = '<div class="cx-vacio"><strong>No tienes solicitudes de garantía</strong>Si un producto presenta un defecto, solicítala con el formulario de arriba.</div>';
            return;
        }

        listaGarantias.innerHTML = garantias.map(g => `
            <article class="cuenta-item">
                <div class="cuenta-item-encabezado">
                    <div>
                        <h3>${C.escapar(g.folio || `Garantía #${g.id}`)}</h3>
                        <small>Solicitada el ${C.fecha(g.fecha_solicitud, true)}</small>
                    </div>
                    ${C.estado(g.estado)}
                </div>

                <div class="cuenta-item-datos">
                    <div><span>Pedido</span><strong>#${Number(g.id_pedido)}</strong></div>
                    <div><span>Producto</span><strong>${C.escapar(g.producto)}</strong></div>
                    <div><span>Motivo</span><strong>${C.escapar(g.motivo)}</strong></div>
                </div>

                <div class="cuenta-bloque">
                    <h4>Descripción</h4>
                    <p>${C.escapar(g.descripcion || "—")}</p>
                </div>

                ${g.resolucion ? `<div class="cuenta-bloque"><h4>Resolución de CUBEX</h4><p>${C.escapar(g.resolucion)}</p></div>` : ""}

                ${historialHTML(g.historial)}

                <div class="cuenta-item-acciones">
                    ${g.tiene_evidencia ? `<button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-evidencia="garantias" data-id="${Number(g.id)}">Ver fotografía</button>` : ""}
                </div>
            </article>`).join("");
    }

    listaGarantias.addEventListener("click", evento => {
        const boton = evento.target.closest("[data-evidencia]");
        if (boton) verEvidencia(boton.dataset.evidencia, boton.dataset.id);
    });

    formGarantia.addEventListener("submit", async evento => {
        evento.preventDefault();

        const item = estadoPagina.elegibles[Number(document.getElementById("garantiaProducto").value)];
        const motivo = document.getElementById("garantiaMotivo").value;
        const descripcion = document.getElementById("garantiaDescripcion").value.trim();
        const archivo = document.getElementById("garantiaEvidencia").files[0];

        if (!item) return C.aviso("Selecciona el pedido y el producto.", "advertencia");
        if (!motivo) return C.aviso("Selecciona el motivo.", "advertencia");
        if (descripcion.length < 10) return C.aviso("Describe el problema con al menos 10 caracteres.", "advertencia");

        const boton = document.getElementById("btnEnviarGarantia");
        boton.disabled = true;
        boton.textContent = "Enviando...";

        try {
            const resultado = await enviarConEvidencia(`${API_LOGISTICA}/garantias`, {
                id_pedido: item.id_pedido,
                id_producto: item.id_producto,
                motivo,
                descripcion
            }, archivo);

            C.aviso(resultado.mensaje, "exito", 7000);
            formGarantia.reset();
            await cargarGarantias();
        } catch (error) {
            if (!manejarSesionExpirada(error)) C.aviso(error.message, "error", 7000);
        } finally {
            boton.disabled = false;
            boton.textContent = "Enviar solicitud";
        }
    });

    // ------------------------------------------------------------
    // MIS DEVOLUCIONES
    // ------------------------------------------------------------

    const listaDevoluciones = document.getElementById("listaDevoluciones");
    const formDevolucion = document.getElementById("formDevolucion");

    async function cargarDevoluciones() {
        listaDevoluciones.innerHTML = '<div class="cx-cargando">Cargando tus devoluciones...</div>';

        try {
            await cargarCatalogos();
            await cargarElegibles();
            const resultado = await C.api(`${API_LOGISTICA}/devoluciones/mias`, { cache: "no-store" });
            pintarDevoluciones(resultado.datos || []);
        } catch (error) {
            if (manejarSesionExpirada(error)) return;

            listaDevoluciones.innerHTML = `<div class="cx-vacio"><strong>No pudimos cargar tus devoluciones</strong>${C.escapar(error.message)}</div>`;
        }
    }

    function pintarDevoluciones(devoluciones) {
        if (!devoluciones.length) {
            listaDevoluciones.innerHTML = '<div class="cx-vacio"><strong>No tienes solicitudes de devolución</strong>Puedes solicitar una con el formulario de arriba.</div>';
            return;
        }

        const condiciones = { vendible: "En buen estado", danado: "Dañado", no_apto: "No apto para venta" };

        listaDevoluciones.innerHTML = devoluciones.map(d => `
            <article class="cuenta-item">
                <div class="cuenta-item-encabezado">
                    <div>
                        <h3>${C.escapar(d.folio || `Devolución #${d.id}`)}</h3>
                        <small>Solicitada el ${C.fecha(d.fecha, true)}</small>
                    </div>
                    ${C.estado(d.estado)}
                </div>

                <div class="cuenta-item-datos">
                    <div><span>Pedido</span><strong>#${Number(d.id_pedido)}</strong></div>
                    <div><span>Producto</span><strong>${C.escapar(d.producto)}</strong></div>
                    <div><span>Cantidad</span><strong>${Number(d.cantidad)} de ${Number(d.cantidad_comprada || d.cantidad)}</strong></div>
                    <div><span>Motivo</span><strong>${C.escapar(d.motivo)}</strong></div>
                    <div><span>Prefieres</span><strong>${d.preferencia === "reemplazo" ? "Reemplazo" : "Reembolso"}</strong></div>
                </div>

                ${d.estado === "rechazada" && d.observaciones ? `<div class="cuenta-bloque"><h4>Motivo del rechazo</h4><p>${C.escapar(d.observaciones)}</p></div>` : ""}

                ${d.instrucciones ? `<div class="cuenta-bloque"><h4>Instrucciones de devolución</h4><p>${C.escapar(d.instrucciones)}</p></div>` : ""}

                ${d.fecha_recepcion ? `
                    <div class="cuenta-bloque">
                        <h4>Recepción del producto</h4>
                        <p>Recibimos ${Number(d.cantidad_recibida)} unidad(es) el ${C.fecha(d.fecha_recepcion, true)}.
                        Condición: ${C.escapar(condiciones[d.condicion_producto] || "—")}.</p>
                    </div>` : ""}

                ${d.tipo_resolucion ? `
                    <div class="cuenta-bloque">
                        <h4>${d.tipo_resolucion === "reemplazo" ? "Reemplazo" : "Reembolso"}</h4>
                        ${d.monto_reembolso ? `<p>Monto: <strong>${C.moneda(d.monto_reembolso)}</strong></p>` : ""}
                        ${d.referencia_resolucion ? `<p>Referencia: ${C.escapar(d.referencia_resolucion)}</p>` : ""}
                        <p>${d.estado === "completada" ? `Completado el ${C.fecha(d.fecha_resolucion, true)}.` : "En proceso."}</p>
                    </div>` : ""}

                ${historialHTML(d.historial)}

                <div class="cuenta-item-acciones">
                    ${d.estado === "aprobada" ? `<button type="button" class="cx-btn cx-btn-primario cx-btn-chico" data-enviado="${Number(d.id)}">Ya envié el producto</button>` : ""}
                    ${d.tiene_evidencia ? `<button type="button" class="cx-btn cx-btn-secundario cx-btn-chico" data-evidencia="devoluciones" data-id="${Number(d.id)}">Ver evidencia</button>` : ""}
                </div>
            </article>`).join("");
    }

    listaDevoluciones.addEventListener("click", async evento => {
        const evidencia = evento.target.closest("[data-evidencia]");
        const enviado = evento.target.closest("[data-enviado]");

        if (evidencia) verEvidencia(evidencia.dataset.evidencia, evidencia.dataset.id);

        if (enviado) {
            const ok = await C.confirmar({
                titulo: "¿Ya enviaste el producto?",
                mensaje: "Confirma que seguiste las instrucciones y enviaste el producto a CUBEX.",
                textoConfirmar: "Sí, ya lo envié"
            });

            if (!ok) return;

            enviado.disabled = true;

            try {
                const resultado = await C.api(`${API_LOGISTICA}/devoluciones/${enviado.dataset.enviado}/enviado`, {
                    method: "POST",
                    body: {}
                });
                C.aviso(resultado.mensaje, "exito");
                await cargarDevoluciones();
            } catch (error) {
                if (!manejarSesionExpirada(error)) C.aviso(error.message, "error");
                enviado.disabled = false;
            }
        }
    });

    formDevolucion.addEventListener("submit", async evento => {
        evento.preventDefault();

        const item = estadoPagina.elegibles[Number(document.getElementById("devolucionProducto").value)];
        const cantidad = Number(document.getElementById("devolucionCantidad").value);
        const motivo = document.getElementById("devolucionMotivo").value;
        const preferencia = document.getElementById("devolucionPreferencia").value;
        const descripcion = document.getElementById("devolucionDescripcion").value.trim();
        const archivo = document.getElementById("devolucionEvidencia").files[0];

        if (!item) return C.aviso("Selecciona el pedido y el producto.", "advertencia");

        if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > item.cantidad_disponible_devolucion) {
            return C.aviso(`La cantidad debe estar entre 1 y ${item.cantidad_disponible_devolucion}.`, "advertencia");
        }

        if (!motivo) return C.aviso("Selecciona el motivo.", "advertencia");
        if (descripcion.length < 10) return C.aviso("Escribe una descripción de al menos 10 caracteres.", "advertencia");

        const boton = document.getElementById("btnEnviarDevolucion");
        boton.disabled = true;
        boton.textContent = "Enviando...";

        try {
            const resultado = await enviarConEvidencia(`${API_LOGISTICA}/devoluciones`, {
                id_pedido: item.id_pedido,
                id_producto: item.id_producto,
                cantidad,
                motivo,
                preferencia,
                descripcion
            }, archivo);

            C.aviso(resultado.mensaje, "exito", 7000);
            formDevolucion.reset();
            document.getElementById("ayudaDevolucionProducto").textContent = "";
            await cargarDevoluciones();
        } catch (error) {
            if (!manejarSesionExpirada(error)) C.aviso(error.message, "error", 7000);
        } finally {
            boton.disabled = false;
            boton.textContent = "Enviar solicitud";
        }
    });

    // ------------------------------------------------------------
    // INICIO
    // ------------------------------------------------------------

    pintarUsuario();
    estadoPagina.cargado.perfil = false;
    mostrarPanel(window.location.hash.slice(1) || "perfil");
})();
