/* =====================================================================
   CUBEX - INVENTARIO AUTOMÁTICO (panel)
   Alertas, entradas de mercancía, ajustes auditados, historial de
   movimientos y unidades vendidas. Datos del microservicio 3005.
   ===================================================================== */

(function () {
    "use strict";

    const C = window.Cubex;
    const API = `${CUBEX_CONFIG.API.INVENTARIO}/api`;
    const esAdmin = C.rol() === "ADMIN";

    const NOMBRES_TIPO = {
        entrada: "Entrada",
        venta: "Venta",
        devolucion: "Devolución",
        cancelacion: "Cancelación",
        ajuste: "Ajuste"
    };

    const NOMBRES_ALERTA = {
        agotado: ["Agotado", "peligro"],
        stock_minimo: ["Stock mínimo", "advertencia"],
        stock_bajo: ["Pocas unidades", "advertencia"],
        salida: ["Salida", "info"],
        entrada: ["Entrada", "exito"]
    };

    const elementos = {
        riesgo: document.getElementById("productosRiesgo"),
        alertas: document.getElementById("listaAlertas"),
        movimientos: document.getElementById("tablaMovimientos"),
        vendidas: document.getElementById("tablaVendidas"),
        movProducto: document.getElementById("movProducto"),
        movTipo: document.getElementById("movTipo"),
        movPedido: document.getElementById("movPedido"),
        entradaProducto: document.getElementById("entradaProducto"),
        ajusteProducto: document.getElementById("ajusteProducto")
    };

    if (!elementos.movimientos) return;

    if (esAdmin) {
        document.getElementById("panelAjuste").hidden = false;
    }

    function tabla(encabezados, filas, vacio) {
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

    // ------------------------------------------------------------
    // PRODUCTOS PARA LOS SELECTORES
    // ------------------------------------------------------------

    async function cargarProductos() {
        try {
            const resultado = await C.api(`${API}/productos`, { cache: "no-store" });
            const productos = (resultado.data || []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre));

            const opciones = productos.map(p =>
                `<option value="${Number(p.id)}">${C.escapar(p.nombre)} (stock: ${Number(p.stock_actual ?? 0)})${Number(p.activo) === 0 ? " — dado de baja" : ""}</option>`
            ).join("");

            elementos.entradaProducto.innerHTML = '<option value="">Selecciona un producto</option>' + opciones;
            elementos.ajusteProducto.innerHTML = '<option value="">Selecciona un producto</option>' + opciones;

            const filtro = elementos.movProducto.value;
            elementos.movProducto.innerHTML = '<option value="">Todos los productos</option>' + opciones;
            elementos.movProducto.value = filtro;
        } catch (error) {
            C.aviso(`No se pudieron cargar los productos: ${error.message}`, "error");
        }
    }

    // ------------------------------------------------------------
    // ALERTAS
    // ------------------------------------------------------------

    async function cargarAlertas() {
        try {
            const resultado = await C.api(`${API}/inventario/alertas?limite=30`, { cache: "no-store" });
            const datos = resultado.datos || {};
            const riesgo = datos.productos_en_riesgo || [];

            elementos.riesgo.innerHTML = riesgo.length
                ? tabla(
                    ["Producto", "Existencias", "Stock mínimo", "Situación"],
                    riesgo.map(p => {
                        const [texto, tono] = NOMBRES_ALERTA[p.nivel] || [p.nivel, "neutro"];
                        return `
                            <tr>
                                <td>${C.escapar(p.nombre)}</td>
                                <td><strong>${Number(p.stock_actual)}</strong></td>
                                <td>${Number(p.stock_minimo)}</td>
                                <td><span class="cx-estado cx-estado-${tono}">${C.escapar(texto)}</span>
                                    ${p.nivel === "agotado" ? "<br><small>No se muestra en la tienda</small>" : ""}</td>
                            </tr>`;
                    }),
                    ""
                )
                : `<p class="cx-mensaje cx-mensaje-exito">Ningún producto activo está agotado ni por debajo de ${Number(datos.umbral_stock_bajo || 5)} unidades.</p>`;

            const alertas = datos.alertas || [];

            elementos.alertas.innerHTML = alertas.length
                ? `<h3 style="margin:16px 0 8px;font-size:15px">Últimas alertas</h3>
                   <ul class="cx-historial">
                       ${alertas.map(a => {
                           const [texto, tono] = NOMBRES_ALERTA[a.tipo] || [a.tipo, "neutro"];
                           return `
                               <li style="${Number(a.leida) ? "opacity:.65" : ""}">
                                   <span class="cx-estado cx-estado-${tono}">${C.escapar(texto)}</span>
                                   · ${C.fecha(a.fecha, true)}<br>${C.escapar(a.mensaje)}
                               </li>`;
                       }).join("")}
                   </ul>`
                : '<p class="log-sub">Todavía no hay alertas registradas.</p>';
        } catch (error) {
            elementos.riesgo.innerHTML = `<div class="cx-vacio"><strong>No se pudieron cargar las alertas</strong>${C.escapar(error.message)}</div>`;
        }

        C.informarAltura();
    }

    document.getElementById("btnMarcarLeidas").addEventListener("click", async () => {
        try {
            await C.api(`${API}/inventario/alertas/leidas`, { method: "PATCH", body: {} });
            C.aviso("Alertas marcadas como leídas.", "exito");
            cargarAlertas();
        } catch (error) {
            C.aviso(error.message, "error");
        }
    });

    // ------------------------------------------------------------
    // MOVIMIENTOS
    // ------------------------------------------------------------

    async function cargarMovimientos() {
        const parametros = new URLSearchParams({ limite: "200" });

        if (elementos.movProducto.value) parametros.set("id_producto", elementos.movProducto.value);
        if (elementos.movTipo.value) parametros.set("tipo", elementos.movTipo.value);
        if (elementos.movPedido.value) parametros.set("id_pedido", elementos.movPedido.value);

        try {
            const resultado = await C.api(`${API}/inventario/movimientos?${parametros}`, { cache: "no-store" });
            const movimientos = resultado.datos || [];

            elementos.movimientos.innerHTML = tabla(
                ["Fecha", "Producto", "Tipo", "Cantidad", "Stock anterior", "Stock resultante", "Pedido", "Usuario / origen", "Motivo"],
                movimientos.map(m => {
                    const sube = Number(m.stock_resultante) > Number(m.stock_anterior);
                    return `
                        <tr>
                            <td>${C.fecha(m.fecha, true)}</td>
                            <td>${C.escapar(m.producto)}</td>
                            <td><span class="cx-estado cx-estado-${sube ? "exito" : "info"}">${C.escapar(NOMBRES_TIPO[m.tipo] || m.tipo)}</span></td>
                            <td><strong>${sube ? "+" : "−"}${Number(m.cantidad)}</strong></td>
                            <td>${Number(m.stock_anterior)}</td>
                            <td>${Number(m.stock_resultante)}</td>
                            <td>${m.id_pedido ? `#${Number(m.id_pedido)}` : "—"}</td>
                            <td><small>${C.escapar(m.usuario || "—")}<br>${C.escapar(m.origen)}</small></td>
                            <td><small>${C.escapar(m.motivo || "—")}</small></td>
                        </tr>`;
                }),
                "No hay movimientos con esos filtros."
            );
        } catch (error) {
            elementos.movimientos.innerHTML = `<div class="cx-vacio"><strong>No se pudieron cargar los movimientos</strong>${C.escapar(error.message)}</div>`;
        }

        C.informarAltura();
    }

    async function cargarVendidas() {
        try {
            const resultado = await C.api(`${API}/inventario/ventas-por-producto`, { cache: "no-store" });
            const filas = (resultado.datos || []).filter(f =>
                Number(f.vendidas) || Number(f.entradas) || Number(f.devueltas) || Number(f.canceladas)
            );

            elementos.vendidas.innerHTML = tabla(
                ["Producto", "Vendidas", "Pedidos", "Canceladas (reintegradas)", "Devueltas al inventario", "Entradas"],
                filas.map(f => `
                    <tr>
                        <td>${C.escapar(f.nombre)}</td>
                        <td><strong>${Number(f.vendidas)}</strong></td>
                        <td>${Number(f.pedidos)}</td>
                        <td>${Number(f.canceladas)}</td>
                        <td>${Number(f.devueltas)}</td>
                        <td>${Number(f.entradas)}</td>
                    </tr>`),
                "Todavía no hay movimientos registrados."
            );
        } catch (error) {
            elementos.vendidas.innerHTML = `<div class="cx-vacio"><strong>No se pudo cargar</strong>${C.escapar(error.message)}</div>`;
        }

        C.informarAltura();
    }

    elementos.movProducto.addEventListener("change", cargarMovimientos);
    elementos.movTipo.addEventListener("change", cargarMovimientos);
    elementos.movPedido.addEventListener("change", cargarMovimientos);

    // ------------------------------------------------------------
    // ENTRADAS Y AJUSTES
    // ------------------------------------------------------------

    async function recargarTodo() {
        await Promise.all([cargarProductos(), cargarAlertas(), cargarMovimientos(), cargarVendidas()]);

        if (typeof window.cargarInventario === "function") {
            window.cargarInventario();
        }
    }

    document.getElementById("formEntrada").addEventListener("submit", async evento => {
        evento.preventDefault();

        const boton = evento.submitter || evento.target.querySelector("button[type=submit]");
        const idProducto = Number(elementos.entradaProducto.value);
        const cantidad = Number(document.getElementById("entradaCantidad").value);

        if (!idProducto) return C.aviso("Selecciona un producto.", "advertencia");
        if (!Number.isInteger(cantidad) || cantidad <= 0) return C.aviso("La cantidad debe ser un entero mayor que cero.", "advertencia");

        boton.disabled = true;

        try {
            const resultado = await C.api(`${API}/inventario/entradas`, {
                method: "POST",
                body: {
                    id_producto: idProducto,
                    cantidad,
                    motivo: document.getElementById("entradaMotivo").value.trim() || null,
                    clave_operacion: C.claveUnica()
                }
            });

            const m = resultado.datos || {};
            C.aviso(`Entrada registrada: ${m.nombre} pasó de ${m.stock_anterior} a ${m.stock_resultante} unidades.`, "exito", 6000);
            evento.target.reset();
            await recargarTodo();
        } catch (error) {
            C.aviso(error.message, "error", 7000);
        } finally {
            boton.disabled = false;
        }
    });

    document.getElementById("formAjuste").addEventListener("submit", async evento => {
        evento.preventDefault();

        const boton = evento.submitter || evento.target.querySelector("button[type=submit]");
        const idProducto = Number(elementos.ajusteProducto.value);
        const stockNuevo = Number(document.getElementById("ajusteStock").value);
        const motivo = document.getElementById("ajusteMotivo").value.trim();

        if (!idProducto) return C.aviso("Selecciona un producto.", "advertencia");
        if (!Number.isInteger(stockNuevo) || stockNuevo < 0) return C.aviso("Las existencias deben ser un entero mayor o igual a cero.", "advertencia");
        if (motivo.length < 3) return C.aviso("Escribe el motivo del ajuste.", "advertencia");

        const ok = await C.confirmar({
            titulo: "¿Registrar ajuste?",
            mensaje: `Las existencias quedarán en ${stockNuevo} unidades. Quedará registrado en el historial.`,
            textoConfirmar: "Registrar ajuste",
            peligro: true
        });

        if (!ok) return;

        boton.disabled = true;

        try {
            const resultado = await C.api(`${API}/inventario/ajustes`, {
                method: "POST",
                body: { id_producto: idProducto, stock_nuevo: stockNuevo, motivo }
            });

            C.aviso(resultado.mensaje, "exito");
            evento.target.reset();
            await recargarTodo();
        } catch (error) {
            C.aviso(error.message, "error", 7000);
        } finally {
            boton.disabled = false;
        }
    });

    recargarTodo();
    C.informarAltura();
})();
