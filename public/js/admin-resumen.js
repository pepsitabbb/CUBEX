/* =====================================================================
   CUBEX - RESUMEN DEL PANEL DE ADMINISTRADOR
   Llena las tarjetas de "Estado de la tienda" con datos reales.
   ===================================================================== */

(function () {
    "use strict";

    const C = window.Cubex;
    const API = CUBEX_CONFIG.API;

    function colocar(id, valor) {
        const elemento = document.getElementById(id);
        if (elemento) elemento.textContent = valor;
    }

    async function cargarResumen() {
        try {
            const productos = (await C.api(`${API.INVENTARIO}/api/productos`, { cache: "no-store" })).data || [];
            const activos = productos.filter(p => Number(p.activo) !== 0);

            colocar("statProductos", activos.length);
            colocar("statUnidades", activos.reduce((suma, p) => suma + Math.max(0, Number(p.stock_actual || 0)), 0));

            const agotados = activos.filter(p => Number(p.stock_actual || 0) <= 0).length;
            const bajos = activos.filter(p => Number(p.stock_actual || 0) <= 5).length;

            colocar("statStockBajo", bajos);
            colocar("notaStockBajo", `${agotados} agotado(s), ocultos en la tienda`);
        } catch (error) {
            colocar("notaStockBajo", "Servicio de inventario no disponible");
        }

        try {
            const respuesta = await C.api(`${API.ROLES}/usuarios`, { cache: "no-store" });
            const usuarios = Array.isArray(respuesta) ? respuesta : (respuesta.usuarios || respuesta.data || respuesta.datos || []);
            colocar("statUsuarios", usuarios.length);
        } catch {
            colocar("statUsuarios", "—");
        }
    }

    if (C && C.token()) {
        cargarResumen();
    }
})();
