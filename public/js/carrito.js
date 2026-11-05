
/* =====================================================
   CUBEX - CARRITO DE COMPRAS INDEPENDIENTE POR USUARIO
===================================================== */

const CLAVE_TOKEN = "cubex_token";
const CLAVE_USUARIO = "cubex_usuario";

let carrito = [];
let usuarioActual = null;
let claveCarritoActual = null;
let observadorCarrito = null;


/* =====================================================
   IDENTIFICAR AL USUARIO
===================================================== */

function obtenerUsuarioActual() {

    const token = sessionStorage.getItem(CLAVE_TOKEN);
    const usuarioGuardado = sessionStorage.getItem(CLAVE_USUARIO);

    if (!token) return null;

    let usuario = {};

    try {
        usuario = usuarioGuardado
            ? JSON.parse(usuarioGuardado)
            : {};
    } catch (error) {
        console.error("Error al leer el usuario:", error);
    }

    let idUsuario =
        usuario.id ??
        usuario.id_usuario ??
        usuario.idUsuario ??
        usuario.usuarioId ??
        usuario.usuario?.id ??
        usuario.datos?.id;

    // Obtener el ID desde el JWT si no está guardado.
    if (!idUsuario) {
        try {
            const parteToken = token.split(".")[1];

            if (!parteToken) return null;

            const base64 = parteToken
                .replace(/-/g, "+")
                .replace(/_/g, "/");

            const base64Completo = base64.padEnd(
                Math.ceil(base64.length / 4) * 4,
                "="
            );

            const payload = JSON.parse(
                decodeURIComponent(
                    Array.prototype.map.call(
                        atob(base64Completo),
                        c => "%" +
                            ("00" + c.charCodeAt(0).toString(16)).slice(-2)
                    ).join("")
                )
            );

            idUsuario = payload.sub;

        } catch (error) {
            console.error("No se pudo leer el token:", error);
        }
    }

    if (
        idUsuario === undefined ||
        idUsuario === null ||
        idUsuario === ""
    ) {
        console.error("No se encontró el ID del usuario.");
        return null;
    }

    return {
        ...usuario,
        id: String(idUsuario)
    };
}


/* =====================================================
   CLAVE INDIVIDUAL DEL CARRITO
===================================================== */

function obtenerClaveCarrito() {

    usuarioActual = obtenerUsuarioActual();

    if (!usuarioActual) return null;

    return `cubex_carrito_${usuarioActual.id}`;
}


/* =====================================================
   VERIFICAR SESIÓN
===================================================== */

function tieneSesion() {

    // Actualizar siempre la identidad para evitar mezclar cuentas.
    const nuevaClave = obtenerClaveCarrito();

    if (!nuevaClave) {
        claveCarritoActual = null;
        usuarioActual = null;
        carrito = [];
        return false;
    }

    if (nuevaClave !== claveCarritoActual) {
        claveCarritoActual = nuevaClave;
        cargarCarrito();
    }

    return Boolean(
        sessionStorage.getItem(CLAVE_TOKEN) &&
        usuarioActual &&
        claveCarritoActual
    );
}


/* =====================================================
   CARGAR CARRITO
===================================================== */

function cargarCarrito() {

    const nuevaClave = obtenerClaveCarrito();

    if (!nuevaClave) {
        claveCarritoActual = null;
        carrito = [];
        actualizarCarrito();
        return;
    }

    claveCarritoActual = nuevaClave;

    try {
        const guardado = sessionStorage.getItem(claveCarritoActual);

        carrito = guardado ? JSON.parse(guardado) : [];

        if (!Array.isArray(carrito)) {
            carrito = [];
        }

    } catch (error) {
        console.error("Error al cargar el carrito:", error);
        carrito = [];
    }

    actualizarCarrito();
}


/* =====================================================
   GUARDAR CARRITO
===================================================== */

function guardarCarrito() {

    const nuevaClave = obtenerClaveCarrito();

    if (!nuevaClave) return false;

    claveCarritoActual = nuevaClave;

    try {
        sessionStorage.setItem(
            claveCarritoActual,
            JSON.stringify(carrito)
        );

        return true;

    } catch (error) {
        console.error("Error al guardar el carrito:", error);
        return false;
    }
}


/* =====================================================
   NORMALIZAR DATOS DEL PRODUCTO
===================================================== */

function normalizarProducto(producto) {

    // Precio vigente: oferta activa si existe; si no, precio normal.
    const oferta = producto.ofertaActiva;
    const precioOferta =
        oferta && Number(oferta.activa) === 1 && Number(oferta.precio_oferta) > 0
            ? Number(oferta.precio_oferta)
            : null;

    const imagen =
        producto.imagen ??
        producto.foto ??
        producto.url_imagen ??
        producto.imagen_url ??
        "";

    const stock = Number(
        producto.stock_disponible ??
        producto.stock_actual ??
        NaN
    );

    return {
        id:
            producto.id ??
            producto.id_producto ??
            producto.producto_id,

        nombre:
            producto.nombre ??
            producto.nombre_producto ??
            producto.nombreProducto ??
            "Producto CUBEX",

        precio: Number(
            precioOferta ??
            producto.precio_mostrar ??
            producto.precio ??
            producto.precio_venta ??
            producto.precioVenta ??
            0
        ),

        imagen: window.Cubex ? Cubex.urlImagen(imagen) : imagen,

        // Existencias conocidas (se vuelven a validar con el servidor).
        stock: Number.isFinite(stock) ? stock : null,

        cantidad: 1
    };
}


/* =====================================================
   VALIDAR EXISTENCIAS CON EL SERVIDOR (MySQL)
   La disponibilidad real la decide el microservicio de
   inventario; aquí solo se informa al cliente.
===================================================== */

let validandoCarrito = null;

async function validarCarritoConServidor() {

    if (!carrito.length || !window.CUBEX_CONFIG) {
        return { valido: carrito.length > 0, problemas: [] };
    }

    if (validandoCarrito) return validandoCarrito;

    validandoCarrito = (async () => {
        try {
            const respuesta = await fetch(
                `${CUBEX_CONFIG.API.INVENTARIO}/api/inventario/disponibilidad`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        articulos: carrito.map(item => ({
                            id_producto: Number(item.id),
                            cantidad: Number(item.cantidad)
                        }))
                    })
                }
            );

            const resultado = await respuesta.json().catch(() => ({}));

            if (!respuesta.ok) {
                throw new Error(resultado.mensaje || resultado.message || "No se pudo validar el inventario.");
            }

            const articulos = (resultado.datos || resultado.data || {}).articulos || [];
            const problemas = [];

            carrito.forEach(item => {
                const info = articulos.find(a => Number(a.id_producto) === Number(item.id));

                if (!info) return;

                item.stock = Number(info.stock_disponible);

                if (info.nombre) item.nombre = info.nombre;

                if (Number.isFinite(Number(info.precio)) && Number(info.precio) !== Number(item.precio)) {
                    item.precio = Number(info.precio);
                    item.precioActualizado = true;
                }

                if (!info.suficiente) {
                    problemas.push(item);
                }
            });

            guardarCarrito();
            actualizarCarrito();

            return { valido: problemas.length === 0, problemas };

        } catch (error) {
            console.error("Error al validar existencias:", error);
            return { valido: false, problemas: [], error: error.message };

        } finally {
            validandoCarrito = null;
        }
    })();

    return validandoCarrito;
}


/* =====================================================
   AGREGAR PRODUCTO
===================================================== */

function agregarAlCarrito(producto) {

    if (!tieneSesion()) {
        mostrarMensajeCarrito(
            "Inicia sesión para agregar productos al carrito."
        );
        return;
    }

    if (!producto) {
        console.error("No se recibió un producto.");
        return;
    }

    const nuevoProducto = normalizarProducto(producto);

    if (
        nuevoProducto.id === undefined ||
        nuevoProducto.id === null
    ) {
        console.error(
            "El producto no tiene un identificador:",
            producto
        );

        mostrarMensajeCarrito(
            "No se pudo identificar el producto."
        );

        return;
    }

    if (
        !Number.isFinite(nuevoProducto.precio) ||
        nuevoProducto.precio < 0
    ) {
        mostrarMensajeCarrito(
            "El precio del producto no es válido."
        );
        return;
    }

    if (
        producto.disponible === false ||
        (nuevoProducto.stock !== null && nuevoProducto.stock <= 0)
    ) {
        mostrarMensajeCarrito(
            "Este producto no está disponible por el momento."
        );
        return;
    }

    const existente = carrito.find(
        item => String(item.id) === String(nuevoProducto.id)
    );

    const limite = nuevoProducto.stock ?? existente?.stock ?? null;
    const cantidadActual = existente ? Number(existente.cantidad) : 0;

    if (limite !== null && cantidadActual + 1 > limite) {
        mostrarMensajeCarrito(
            `Solo hay ${limite} unidad(es) disponibles de este producto.`
        );
        abrirCarrito();
        return;
    }

    if (existente) {
        existente.cantidad++;
        existente.stock = limite;
        existente.precio = nuevoProducto.precio;
    } else {
        carrito.push(nuevoProducto);
    }

    guardarCarrito();
    actualizarCarrito();

    mostrarMensajeCarrito("Producto agregado al carrito.");

    abrirCarrito();
}


/* =====================================================
   AUMENTAR CANTIDAD
===================================================== */

function aumentarCantidad(id) {

    if (!tieneSesion()) return;

    const producto = carrito.find(
        item => String(item.id) === String(id)
    );

    if (!producto) return;

    if (
        producto.stock !== null &&
        producto.stock !== undefined &&
        Number(producto.cantidad) + 1 > Number(producto.stock)
    ) {
        mostrarMensajeCarrito(
            `Solo hay ${producto.stock} unidad(es) disponibles de "${producto.nombre}".`
        );
        return;
    }

    producto.cantidad++;

    guardarCarrito();
    actualizarCarrito();
}


/* =====================================================
   DISMINUIR CANTIDAD
===================================================== */

function disminuirCantidad(id) {

    if (!tieneSesion()) return;

    const producto = carrito.find(
        item => String(item.id) === String(id)
    );

    if (!producto) return;

    if (producto.cantidad > 1) {
        producto.cantidad--;
    } else {
        eliminarProducto(id);
        return;
    }

    guardarCarrito();
    actualizarCarrito();
}


/* =====================================================
   ELIMINAR PRODUCTO
===================================================== */

function eliminarProducto(id) {

    if (!tieneSesion()) return;

    carrito = carrito.filter(
        item => String(item.id) !== String(id)
    );

    guardarCarrito();
    actualizarCarrito();

    mostrarMensajeCarrito("Producto eliminado del carrito.");
}


/* =====================================================
   FORMATO DE PRECIO
===================================================== */

function formatearPrecio(precio) {

    return Number(precio || 0).toLocaleString("es-MX", {
        style: "currency",
        currency: "MXN"
    });
}


/* =====================================================
   ACTUALIZAR CONTADOR
===================================================== */

function actualizarContadorCarrito() {

    const contador = document.getElementById("contadorCarrito");

    if (!contador) return;

    const cantidadTotal = carrito.reduce(
        (total, producto) =>
            total + Number(producto.cantidad || 0),
        0
    );

    contador.textContent = cantidadTotal;
    contador.style.display = "inline-flex";
}


/* =====================================================
   ESCAPAR HTML
===================================================== */

function escaparHTML(valor) {

    return String(valor ?? "").replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caracter]);
}


/* =====================================================
   ACTUALIZAR CONTENIDO DEL CARRITO
===================================================== */

function actualizarCarrito() {

    actualizarContadorCarrito();

    const contenedor =
        document.getElementById("carritoContenido") ||
        document.querySelector(".carrito-contenido");

    const totalElemento =
        document.getElementById("totalCarrito") ||
        document.querySelector(".carrito-total strong");

    // Si el panel todavía no existe, no modificar nada.
    if (!contenedor || !totalElemento) return;

    if (!tieneSesion()) {

        contenedor.innerHTML = `
            <div class="carrito-vacio">
                <p>Inicia sesión para utilizar tu carrito.</p>
            </div>
        `;

        totalElemento.textContent = formatearPrecio(0);
        return;
    }

    if (carrito.length === 0) {

        contenedor.innerHTML = `
            <div class="carrito-vacio">
                <p>Tu carrito está vacío.</p>
                <p>¡Agrega productos para comenzar tu compra!</p>
            </div>
        `;

        totalElemento.textContent = formatearPrecio(0);
        return;
    }

    let total = 0;

    contenedor.innerHTML = carrito.map(producto => {

        const precio = Number(producto.precio) || 0;
        const cantidad = Number(producto.cantidad) || 1;
        const subtotal = precio * cantidad;

        total += subtotal;

        const id = escaparHTML(String(producto.id));
        const nombre = escaparHTML(producto.nombre);
        const imagen = escaparHTML(
            window.Cubex ? Cubex.urlImagen(producto.imagen) : producto.imagen
        );

        let avisoStock = "";

        if (producto.stock !== null && producto.stock !== undefined) {
            if (Number(producto.stock) <= 0) {
                avisoStock = `<p class="carrito-item-aviso agotado">Agotado: elimínalo para continuar.</p>`;
            } else if (cantidad > Number(producto.stock)) {
                avisoStock = `<p class="carrito-item-aviso agotado">Solo quedan ${Number(producto.stock)}. Reduce la cantidad.</p>`;
            } else if (Number(producto.stock) <= 5) {
                avisoStock = `<p class="carrito-item-aviso">Quedan ${Number(producto.stock)} disponibles.</p>`;
            }
        }

        if (producto.precioActualizado) {
            avisoStock += `<p class="carrito-item-aviso">El precio se actualizó.</p>`;
        }

        return `
            <article class="carrito-item">

                ${
                    imagen
                        ? `
                            <img
                                src="${imagen}"
                                alt="${nombre}"
                                class="carrito-item-imagen"
                                onerror="this.style.display='none'"
                            >
                        `
                        : ""
                }

                <div class="carrito-item-info">

                    <h3>${nombre}</h3>

                    <p class="carrito-item-precio">
                        ${formatearPrecio(precio)}
                    </p>

                    ${avisoStock}

                    <div class="carrito-cantidad">

                        <button
                            type="button"
                            data-accion="disminuir"
                            data-id="${id}">
                            −
                        </button>

                        <span>${cantidad}</span>

                        <button
                            type="button"
                            data-accion="aumentar"
                            data-id="${id}">
                            +
                        </button>

                        <button
                            type="button"
                            class="btn-eliminar-producto"
                            data-accion="eliminar"
                            data-id="${id}">
                            ✕
                        </button>

                    </div>

                </div>

            </article>
        `;

    }).join("");

    totalElemento.textContent = formatearPrecio(total);
}


/* =====================================================
   MENSAJES DEL CARRITO
===================================================== */

function mostrarMensajeCarrito(texto, duracion = 3500) {

    ["mensajeCarrito", "mensajeCarritoPanel"].forEach(id => {
        const elemento = document.getElementById(id);

        if (!elemento) return;

        elemento.textContent = texto;
        elemento.classList.add("visible");

        clearTimeout(elemento._temporizador);

        elemento._temporizador = setTimeout(() => {
            elemento.classList.remove("visible");
            elemento.textContent = "";
        }, duracion);
    });
}


/* =====================================================
   ABRIR CARRITO
===================================================== */

function abrirCarrito() {

    if (!tieneSesion()) {
        mostrarMensajeCarrito("Inicia sesión para utilizar tu carrito.");
        return;
    }

    actualizarCarrito();

    const panel =
        document.getElementById("panelCarrito") ||
        document.querySelector(".panel-carrito");

    const overlay =
        document.getElementById("carritoOverlay") ||
        document.querySelector(".carrito-overlay");

    if (!panel) {
        console.warn("No se encontró el panel del carrito.");
        return;
    }

    panel.classList.add("abierto");

    if (overlay) {
        overlay.classList.add("activo");
    }

    document.body.style.overflow = "hidden";

    // Revisar existencias reales cada vez que se abre el carrito.
    validarCarritoConServidor().then(resultado => {
        if (resultado.problemas && resultado.problemas.length) {
            mostrarMensajeCarrito(
                "Algunos productos ya no tienen existencias suficientes. Actualiza tu carrito.",
                6000
            );
        }
    });
}


/* =====================================================
   CERRAR CARRITO
===================================================== */

function cerrarCarrito() {

    const panel =
        document.getElementById("panelCarrito") ||
        document.querySelector(".panel-carrito");

    const overlay =
        document.getElementById("carritoOverlay") ||
        document.querySelector(".carrito-overlay");

    if (panel) {
        panel.classList.remove("abierto");
    }

    if (overlay) {
        overlay.classList.remove("activo");
    }

    document.body.style.overflow = "";
}


/* =====================================================
   CONTINUAR COMPRA
===================================================== */

async function continuarCompra() {

    if (!tieneSesion()) {
        mostrarMensajeCarrito(
            "Inicia sesión para continuar con tu compra."
        );
        return;
    }

    if (carrito.length === 0) {
        mostrarMensajeCarrito("Tu carrito está vacío.");
        return;
    }

    const boton = document.getElementById("btnContinuarCompra");

    if (boton) {
        boton.disabled = true;
        boton.textContent = "Revisando existencias...";
    }

    const resultado = await validarCarritoConServidor();

    if (boton) {
        boton.disabled = false;
        boton.textContent = "Continuar compra";
    }

    if (resultado.error) {
        mostrarMensajeCarrito(
            "No se pudo comprobar el inventario. Intenta nuevamente.",
            6000
        );
        return;
    }

    if (!resultado.valido) {
        const nombres = resultado.problemas.map(p => p.nombre).join(", ");

        mostrarMensajeCarrito(
            `Actualiza tu carrito antes de continuar: ${nombres} ya no tiene(n) existencias suficientes.`,
            7000
        );
        return;
    }

    guardarCarrito();

    window.location.href = "domicilio.html";
}


/* =====================================================
   EVENTOS DEL CARRITO
===================================================== */

// Delegación de eventos para botones dinámicos.
document.addEventListener("click", event => {

    const botonAccion = event.target.closest("[data-accion]");

    if (botonAccion) {

        const id = botonAccion.dataset.id;
        const accion = botonAccion.dataset.accion;

        if (accion === "aumentar") {
            aumentarCantidad(id);
        }

        if (accion === "disminuir") {
            disminuirCantidad(id);
        }

        if (accion === "eliminar") {
            eliminarProducto(id);
        }

        return;
    }

    // Abrir carrito.
    if (event.target.closest("#abrirCarrito")) {
        abrirCarrito();
        return;
    }

    // Cerrar carrito.
    if (
        event.target.closest("#cerrarCarrito") ||
        event.target.closest(".btn-cerrar-carrito")
    ) {
        cerrarCarrito();
        return;
    }

    // Continuar compra.
    if (event.target.closest("#btnContinuarCompra")) {
        continuarCompra();
        return;
    }

    // Clic en el fondo del carrito.
    const overlay =
        document.getElementById("carritoOverlay") ||
        document.querySelector(".carrito-overlay");

    if (overlay && event.target === overlay) {
        cerrarCarrito();
    }

});


/* =====================================================
   INICIALIZAR BOTONES Y PANEL
===================================================== */

function inicializarCarrito() {

    const botonAbrir = document.getElementById("abrirCarrito");

    if (botonAbrir) {
        botonAbrir.style.cursor = "pointer";
    }

    const botonCerrar =
        document.getElementById("cerrarCarrito") ||
        document.querySelector(".btn-cerrar-carrito");

    if (botonCerrar) {
        botonCerrar.style.cursor = "pointer";
    }

    actualizarContadorCarrito();
    actualizarCarrito();
}


/* =====================================================
   DETECTAR CONTENIDO CARGADO DINÁMICAMENTE
===================================================== */

function iniciarCarrito() {

    claveCarritoActual = obtenerClaveCarrito();

    if (claveCarritoActual) {

        try {
            const guardado = sessionStorage.getItem(claveCarritoActual);

            carrito = guardado ? JSON.parse(guardado) : [];

            if (!Array.isArray(carrito)) {
                carrito = [];
            }

        } catch (error) {
            console.error("Error al cargar el carrito:", error);
            carrito = [];
        }

    } else {
        carrito = [];
    }

    inicializarCarrito();

    // Evitar crear varios observadores.
    if (observadorCarrito) {
        observadorCarrito.disconnect();
        observadorCarrito = null;
    }

    const contenidoYaExiste =
        document.getElementById("carritoContenido") ||
        document.querySelector(".carrito-contenido");

    // Si el panel todavía no existe, esperar a que main.js lo inserte.
    if (!contenidoYaExiste) {

        observadorCarrito = new MutationObserver(() => {

            const contenidoCarrito =
                document.getElementById("carritoContenido") ||
                document.querySelector(".carrito-contenido");

            if (!contenidoCarrito) return;

            // Desconectar antes de actualizar el contenido.
            observadorCarrito.disconnect();
            observadorCarrito = null;

            inicializarCarrito();

        });

        observadorCarrito.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // Abrir automáticamente al regresar desde domicilios.
    const parametros = new URLSearchParams(window.location.search);

    if (parametros.get("abrirCarrito") === "1") {

        abrirCarrito();

        parametros.delete("abrirCarrito");

        const nuevaURL =
            window.location.pathname +
            (parametros.toString() ? "?" + parametros.toString() : "") +
            window.location.hash;

        history.replaceState({}, "", nuevaURL);
    }
}


/* =====================================================
   FUNCIONES GLOBALES
===================================================== */

window.agregarAlCarrito = agregarAlCarrito;
window.aumentarCantidad = aumentarCantidad;
window.disminuirCantidad = disminuirCantidad;
window.eliminarProducto = eliminarProducto;
window.abrirCarrito = abrirCarrito;
window.cerrarCarrito = cerrarCarrito;
window.actualizarCarrito = actualizarCarrito;
window.continuarCompra = continuarCompra;
window.cargarCarrito = cargarCarrito;
window.validarCarritoConServidor = validarCarritoConServidor;


/* =====================================================
   ARRANQUE
===================================================== */

if (document.readyState === "loading") {

    document.addEventListener(
        "DOMContentLoaded",
        iniciarCarrito,
        { once: true }
    );

} else {

    iniciarCarrito();

}
