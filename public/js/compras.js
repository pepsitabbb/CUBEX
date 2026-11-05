
/* =====================================================
   CUBEX - COMPRAS A PROVEEDORES
   ===================================================== */

// API DE LOS MICROSERVICIOS
const API_PROVEEDORES = CUBEX_CONFIG.API.PROVEEDORES;
const API_PRODUCTOS = CUBEX_CONFIG.API.INVENTARIO + "/api/productos";
const API_COMPRAS = CUBEX_CONFIG.API.INVENTARIO + "/api/compras";

// ELEMENTOS DEL DOM
const formCompra = document.getElementById("formCompra");

const proveedorCompra = document.getElementById("proveedorCompra");
const productoCompra = document.getElementById("productoCompra");
const fechaCompra = document.getElementById("fechaCompra");
const cantidadCompra = document.getElementById("cantidadCompra");
const costoUnitario = document.getElementById("costoUnitario");
const totalCompra = document.getElementById("totalCompra");

const btnLimpiarCompra = document.getElementById("btnLimpiarCompra");
const btnGuardarCompra = document.getElementById("btnGuardarCompra");
const btnActualizarCompras = document.getElementById("btnActualizarCompras");

const mensajeCompra = document.getElementById("mensajeCompra");
const tablaCompras = document.getElementById("tablaCompras");
const buscarCompra = document.getElementById("buscarCompra");

const totalCompras = document.getElementById("totalCompras");
const importeCompras = document.getElementById("importeCompras");
const contadorCompras = document.getElementById("contadorCompras");

// DATOS
let proveedores = [];
let productos = [];
let compras = [];

// =====================================================
// OBTENER USUARIO DE LA SESIÓN
// =====================================================

function obtenerUsuarioSesion() {
    const usuarioGuardado = sessionStorage.getItem("cubex_usuario");

    if (!usuarioGuardado) {
        throw new Error(
            "No se encontró una sesión activa. Inicia sesión nuevamente."
        );
    }

    let usuario;

    try {
        usuario = JSON.parse(usuarioGuardado);
    } catch (error) {
        throw new Error("Los datos de la sesión no son válidos.");
    }

    // En CUBEX el identificador de sesión es idUsuario.
    const idUsuario = Number(usuario?.idUsuario);

    if (!Number.isInteger(idUsuario) || idUsuario <= 0) {
        throw new Error(
            "No se pudo obtener el ID del administrador. Verifica los datos de la sesión."
        );
    }

    return {
        id: idUsuario,
        datos: usuario
    };
}

// =====================================================
// INICIALIZACIÓN
// =====================================================

document.addEventListener("DOMContentLoaded", iniciarCompras);

async function iniciarCompras() {
    if (!formCompra) {
        console.error("No se encontró el formulario formCompra.");
        return;
    }

    establecerFechaActual();
    configurarEventos();

    costoUnitario.readOnly = true;
    costoUnitario.placeholder = "Se obtiene del producto";

    try {
        // Comprobar que exista una sesión válida.
        const usuario = obtenerUsuarioSesion();

        console.log("Usuario de compras:", usuario.id);

        await cargarProveedores();
        await cargarProductos();
        await cargarCompras();

    } catch (error) {
        console.error("Error al iniciar compras:", error);
        mostrarMensaje(error.message, "error");
    }
}

// =====================================================
// EVENTOS
// =====================================================

function configurarEventos() {

    proveedorCompra?.addEventListener("change", () => {
        mostrarMensaje(
            "Proveedor seleccionado. Ahora selecciona un producto.",
            "normal"
        );
    });

    productoCompra?.addEventListener("change", actualizarCostoProducto);

    cantidadCompra?.addEventListener("input", calcularTotal);

    formCompra?.addEventListener("submit", guardarCompra);

    btnLimpiarCompra?.addEventListener("click", limpiarFormulario);

    btnActualizarCompras?.addEventListener("click", cargarCompras);

    buscarCompra?.addEventListener("input", filtrarCompras);
}

// =====================================================
// FECHA ACTUAL
// =====================================================

function establecerFechaActual() {
    const hoy = new Date();

    const anio = hoy.getFullYear();
    const mes = String(hoy.getMonth() + 1).padStart(2, "0");
    const dia = String(hoy.getDate()).padStart(2, "0");

    if (fechaCompra) {
        fechaCompra.value = `${anio}-${mes}-${dia}`;
    }
}

// =====================================================
// MENSAJES
// =====================================================

function mostrarMensaje(mensaje, tipo = "normal") {
    if (!mensajeCompra) return;

    mensajeCompra.textContent = mensaje;
    mensajeCompra.className = "mensaje-compra";

    if (tipo === "error") {
        mensajeCompra.classList.add("error");
    } else if (tipo === "exito") {
        mensajeCompra.classList.add("exito");
    }
}

// =====================================================
// UTILIDAD PARA LEER RESPUESTAS DE LAS API
// =====================================================

async function obtenerRespuesta(url) {
    const respuesta = await fetch(url);

    const resultado = await respuesta.json();

    if (!respuesta.ok || resultado.success === false) {
        throw new Error(
            resultado.message || `Error HTTP ${respuesta.status}`
        );
    }

    return resultado.data ?? resultado;
}

// =====================================================
// CARGAR PROVEEDORES
// =====================================================

async function cargarProveedores() {
    proveedorCompra.innerHTML =
        '<option value="">Cargando proveedores...</option>';

    try {
        const resultado = await obtenerRespuesta(API_PROVEEDORES);

        proveedores = Array.isArray(resultado)
            ? resultado
            : resultado.proveedores || [];

        proveedorCompra.innerHTML =
            '<option value="">Selecciona un proveedor</option>';

        proveedores.forEach(proveedor => {
            const opcion = document.createElement("option");

            opcion.value = proveedor.id;
            opcion.textContent = proveedor.nombre;

            proveedorCompra.appendChild(opcion);
        });

        if (proveedores.length === 0) {
            proveedorCompra.innerHTML =
                '<option value="">No hay proveedores registrados</option>';
        }

    } catch (error) {
        console.error("Error al cargar proveedores:", error);

        proveedorCompra.innerHTML =
            '<option value="">No se pudieron cargar los proveedores</option>';

        mostrarMensaje(
            "No se pudo conectar con el servicio de proveedores.",
            "error"
        );
    }
}

// =====================================================
// CARGAR PRODUCTOS
// =====================================================

async function cargarProductos() {
    productoCompra.innerHTML =
        '<option value="">Cargando productos...</option>';

    try {
        const resultado = await obtenerRespuesta(API_PRODUCTOS);

        productos = Array.isArray(resultado)
            ? resultado
            : resultado.productos || [];

        productoCompra.innerHTML =
            '<option value="">Selecciona un producto</option>';

        productos.forEach(producto => {
            const opcion = document.createElement("option");

            opcion.value = producto.id;
            opcion.textContent = producto.nombre;
            opcion.dataset.costo = producto.costo;

            productoCompra.appendChild(opcion);
        });

        if (productos.length === 0) {
            productoCompra.innerHTML =
                '<option value="">No hay productos registrados</option>';
        }

    } catch (error) {
        console.error("Error al cargar productos:", error);

        productoCompra.innerHTML =
            '<option value="">No se pudieron cargar los productos</option>';

        mostrarMensaje(
            "No se pudo conectar con el servicio de inventario.",
            "error"
        );
    }
}

// =====================================================
// OBTENER COSTO AUTOMÁTICO DEL PRODUCTO
// =====================================================

function actualizarCostoProducto() {
    const idProducto = productoCompra.value;

    costoUnitario.value = "";
    totalCompra.value = "$0.00";

    if (!idProducto) return;

    const producto = productos.find(
        p => String(p.id) === String(idProducto)
    );

    if (!producto) {
        mostrarMensaje(
            "No se encontró la información del producto.",
            "error"
        );
        return;
    }

    const costo = Number(producto.costo);

    if (!Number.isFinite(costo) || costo <= 0) {
        mostrarMensaje(
            "El producto no tiene un costo válido registrado en inventario.",
            "error"
        );
        return;
    }

    costoUnitario.value = costo.toFixed(2);

    calcularTotal();

    mostrarMensaje(
        `Costo obtenido automáticamente: ${formatearMoneda(costo)}.`,
        "exito"
    );
}

// =====================================================
// CALCULAR TOTAL
// =====================================================

function calcularTotal() {
    const cantidad = Number(cantidadCompra.value);
    const costo = Number(costoUnitario.value);

    if (
        !Number.isInteger(cantidad) ||
        cantidad <= 0 ||
        !Number.isFinite(costo) ||
        costo <= 0
    ) {
        totalCompra.value = "$0.00";
        return;
    }

    const total = cantidad * costo;

    totalCompra.value = formatearMoneda(total);
}

// =====================================================
// GUARDAR COMPRA
// =====================================================

async function guardarCompra(evento) {
    evento.preventDefault();

    try {
        // Obtener el administrador que inició sesión.
        const usuarioSesion = obtenerUsuarioSesion();

        const idUsuario = usuarioSesion.id;
        const idProveedor = Number(proveedorCompra.value);
        const idProducto = Number(productoCompra.value);
        const fecha = fechaCompra.value;

        const cantidad = Number(cantidadCompra.value);
        const costo = Number(costoUnitario.value);

        // Validaciones
        if (!idProveedor || !idProducto || !fecha) {
            mostrarMensaje(
                "Completa todos los campos obligatorios.",
                "error"
            );
            return;
        }

        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            mostrarMensaje(
                "La cantidad debe ser un número entero mayor a cero.",
                "error"
            );
            return;
        }

        if (!Number.isFinite(costo) || costo <= 0) {
            mostrarMensaje(
                "El producto debe tener un costo válido registrado.",
                "error"
            );
            return;
        }

        const producto = productos.find(
            p => Number(p.id) === idProducto
        );

        if (!producto) {
            mostrarMensaje(
                "No se encontró el producto seleccionado.",
                "error"
            );
            return;
        }

        const proveedor = proveedores.find(
            p => Number(p.id) === idProveedor
        );

        if (!proveedor) {
            mostrarMensaje(
                "No se encontró el proveedor seleccionado.",
                "error"
            );
            return;
        }

        // Objeto completo que recibirá el backend.
        const compra = {
            id_proveedor: idProveedor,
            id_usuario: idUsuario,
            id_producto: idProducto,
            cantidad: cantidad,
            costo_unitario: costo,
            fecha: fecha
        };

        console.log("Compra que se enviará al backend:", compra);

        btnGuardarCompra.disabled = true;
        btnGuardarCompra.textContent = "Guardando...";

        const respuesta = await fetch(API_COMPRAS, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(compra)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok || resultado.success === false) {
            throw new Error(
                resultado.message || "No se pudo guardar la compra."
            );
        }

        mostrarMensaje(
            "¡Compra registrada correctamente y stock actualizado!",
            "exito"
        );

        limpiarFormulario();

        await cargarCompras();

        console.log("Compra registrada:", resultado.data);

    } catch (error) {
        console.error("Error al guardar compra:", error);

        mostrarMensaje(error.message, "error");

    } finally {
        btnGuardarCompra.disabled = false;
        btnGuardarCompra.textContent = "Guardar compra";
    }
}

// =====================================================
// CARGAR HISTORIAL
// =====================================================

async function cargarCompras() {
    try {
        const resultado = await obtenerRespuesta(API_COMPRAS);

        compras = Array.isArray(resultado)
            ? resultado
            : resultado.compras || [];

        mostrarCompras(compras);

    } catch (error) {
        console.error("Error al cargar compras:", error);

        if (tablaCompras) {
            tablaCompras.innerHTML = `
                <tr>
                    <td colspan="8" class="tabla-vacia">
                        No se pudo conectar con el servicio de compras.
                    </td>
                </tr>
            `;
        }

        mostrarMensaje(
            "No se pudo consultar el historial de compras.",
            "error"
        );
    }
}

// =====================================================
// MOSTRAR HISTORIAL
// =====================================================

function mostrarCompras(lista) {
    if (!tablaCompras) return;

    tablaCompras.innerHTML = "";

    if (!lista.length) {
        tablaCompras.innerHTML = `
            <tr>
                <td colspan="8" class="tabla-vacia">
                    No hay compras registradas.
                </td>
            </tr>
        `;

        actualizarResumen();
        actualizarContador(0);
        return;
    }

    lista.forEach(compra => {
        const fila = document.createElement("tr");

        fila.innerHTML = `
            <td>${escaparHTML(compra.id ?? "")}</td>
            <td>${escaparHTML(compra.fecha ?? "")}</td>
            <td>${escaparHTML(
                compra.proveedor ?? compra.nombre_proveedor ?? ""
            )}</td>
            <td>${escaparHTML(
                compra.producto ?? compra.nombre_producto ?? ""
            )}</td>
            <td>${Number(compra.cantidad ?? 0)}</td>
            <td>${formatearMoneda(
                Number(compra.costo_unitario) || 0
            )}</td>
            <td>${formatearMoneda(
                Number(compra.total) || 0
            )}</td>
            <td>${escaparHTML(compra.estado ?? "Registrada")}</td>
        `;

        tablaCompras.appendChild(fila);
    });

    actualizarResumen();
    actualizarContador(lista.length);
}

// =====================================================
// RESUMEN
// =====================================================

function actualizarResumen() {
    const cantidad = compras.length;

    const importe = compras.reduce(
        (acumulado, compra) =>
            acumulado + Number(compra.total || 0),
        0
    );

    if (totalCompras) {
        totalCompras.textContent = cantidad;
    }

    if (importeCompras) {
        importeCompras.textContent = formatearMoneda(importe);
    }
}

// =====================================================
// BUSCAR COMPRAS
// =====================================================

function filtrarCompras() {
    const texto = buscarCompra.value.toLowerCase().trim();

    const filtradas = compras.filter(compra => {
        const proveedor = (
            compra.proveedor ||
            compra.nombre_proveedor ||
            ""
        ).toLowerCase();

        const producto = (
            compra.producto ||
            compra.nombre_producto ||
            ""
        ).toLowerCase();

        return (
            proveedor.includes(texto) ||
            producto.includes(texto)
        );
    });

    mostrarCompras(filtradas);
    actualizarContador(filtradas.length);
}

// =====================================================
// CONTADOR
// =====================================================

function actualizarContador(cantidad) {
    if (!contadorCompras) return;

    contadorCompras.textContent =
        `${cantidad} ${
            cantidad === 1
                ? "compra encontrada"
                : "compras encontradas"
        }`;
}

// =====================================================
// LIMPIAR FORMULARIO
// =====================================================

function limpiarFormulario() {
    formCompra.reset();

    costoUnitario.value = "";
    totalCompra.value = "$0.00";

    establecerFechaActual();

    mostrarMensaje(
        "Selecciona un proveedor y un producto para comenzar.",
        "normal"
    );
}

// =====================================================
// FORMATO DE MONEDA
// =====================================================

function formatearMoneda(cantidad) {
    return new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN"
    }).format(cantidad);
}

// =====================================================
// EVITAR INSERTAR HTML DESDE DATOS DE LA API
// =====================================================

function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caracter]);
}
