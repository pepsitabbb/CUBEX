
// ================================================
// CUBEX - MÓDULO DE PROVEEDORES
// Servicio REST Python + Flask + MySQL
// Puerto: 3009
// ================================================

const API_PROVEEDORES = CUBEX_CONFIG.API.PROVEEDORES;

// ELEMENTOS DEL DOM
const tablaProveedores = document.getElementById('tablaProveedores');
const formularioProveedor = document.getElementById('formProveedor');

const btnMostrarFormulario = document.getElementById('btnMostrarFormulario');
const btnCerrarFormulario = document.getElementById('btnCerrarFormulario');
const btnCancelarProveedor = document.getElementById('btnCancelarProveedor');
const btnGuardarProveedor = document.getElementById('btnGuardarProveedor');

const buscarProveedor = document.getElementById('buscarProveedor');

const mensajeProveedores = document.getElementById('mensajeProveedores');

const totalProveedores = document.getElementById('totalProveedores');
const proveedoresRegistrados = document.getElementById('proveedoresRegistrados');
const contadorProveedores = document.getElementById('contadorProveedores');

const seccionFormulario = document.getElementById('formularioProveedor');
const tituloFormulario = document.getElementById('tituloFormulario');

// ELEMENTOS DEL MODAL
const modalConfirmarEliminar = document.getElementById('modalConfirmarEliminar');
const textoConfirmacion = document.getElementById('textoConfirmacion');
const btnCancelarEliminar = document.getElementById('btnCancelarEliminar');
const btnConfirmarEliminar = document.getElementById('btnConfirmarEliminar');

// CAMPOS DEL FORMULARIO
const campos = {
    id: document.getElementById('idProveedor'),
    nombre: document.getElementById('nombreProveedor'),
    razon_social: document.getElementById('razonSocial'),
    rfc: document.getElementById('rfcProveedor'),
    direccion: document.getElementById('direccionProveedor'),
    correo: document.getElementById('correoProveedor'),
    telefono: document.getElementById('telefonoProveedor')
};

let listaProveedores = [];
let temporizadorMensaje;


// ================================================
// INICIALIZACIÓN
// ================================================

document.addEventListener('DOMContentLoaded', () => {
    configurarEventos();
    cargarProveedores();
    ocultarFormulario();
});


// ================================================
// EVENTOS
// ================================================

function configurarEventos() {

    btnMostrarFormulario?.addEventListener('click', () => {
        nuevoProveedor();
        mostrarFormulario();
    });

    btnCerrarFormulario?.addEventListener('click', ocultarFormulario);

    btnCancelarProveedor?.addEventListener('click', () => {
        formularioProveedor.reset();
        ocultarFormulario();
    });

    formularioProveedor?.addEventListener('submit', guardarProveedor);

    buscarProveedor?.addEventListener('input', filtrarProveedores);

    tablaProveedores?.addEventListener('click', manejarAccionesTabla);

    // Cancelar eliminación
    btnCancelarEliminar?.addEventListener('click', () => {
        cerrarModalEliminar(false);
    });

    // Confirmar eliminación
    btnConfirmarEliminar?.addEventListener('click', () => {
        cerrarModalEliminar(true);
    });

    // Cerrar modal al hacer clic fuera de la ventana
    modalConfirmarEliminar?.addEventListener('click', (evento) => {
        if (evento.target === modalConfirmarEliminar) {
            cerrarModalEliminar(false);
        }
    });

    // Cerrar modal con Escape
    document.addEventListener('keydown', (evento) => {
        if (
            evento.key === 'Escape' &&
            modalConfirmarEliminar?.classList.contains('activo')
        ) {
            cerrarModalEliminar(false);
        }
    });
}


// ================================================
// CONSULTAR PROVEEDORES
// ================================================

async function cargarProveedores() {

    try {

        tablaProveedores.innerHTML = `
            <tr>
                <td colspan="6">Cargando proveedores...</td>
            </tr>
        `;

        const respuesta = await fetch(API_PROVEEDORES);

        if (!respuesta.ok) {
            throw new Error('No se pudieron consultar los proveedores.');
        }

        const resultado = await respuesta.json();

        listaProveedores = Array.isArray(resultado)
            ? resultado
            : resultado.data || resultado.proveedores || [];

        mostrarProveedores(listaProveedores);
        actualizarResumen();

    } catch (error) {

        console.error(error);

        tablaProveedores.innerHTML = `
            <tr>
                <td colspan="6">
                    No se pudo conectar con el servicio de proveedores.
                </td>
            </tr>
        `;

        mostrarMensaje(error.message, 'error');
    }
}


// ================================================
// MOSTRAR PROVEEDORES
// ================================================

function mostrarProveedores(proveedores) {

    if (!proveedores.length) {

        tablaProveedores.innerHTML = `
            <tr>
                <td colspan="6">No hay proveedores registrados.</td>
            </tr>
        `;

        actualizarContador(0);
        return;
    }

    tablaProveedores.innerHTML = proveedores.map(proveedor => `
        <tr>
            <td>${escaparHTML(proveedor.nombre)}</td>
            <td>${escaparHTML(proveedor.razon_social)}</td>
            <td>${escaparHTML(proveedor.rfc)}</td>
            <td>${escaparHTML(proveedor.correo)}</td>
            <td>${escaparHTML(proveedor.telefono)}</td>

            <td>
                <div class="table-actions">

                    <button
                        type="button"
                        class="btn-edit"
                        data-action="editar"
                        data-id="${Number(proveedor.id)}"
                        title="Editar proveedor">
                        ✎
                    </button>

                    <button
                        type="button"
                        class="btn-delete"
                        data-action="eliminar"
                        data-id="${Number(proveedor.id)}"
                        title="Eliminar proveedor">
                        ✕
                    </button>

                </div>
            </td>
        </tr>
    `).join('');

    actualizarContador(proveedores.length);
}


// ================================================
// REGISTRAR Y ACTUALIZAR
// ================================================

async function guardarProveedor(evento) {

    evento.preventDefault();

    const id = campos.id.value;

    const datos = {
        nombre: campos.nombre.value.trim(),
        razon_social: campos.razon_social.value.trim(),
        rfc: campos.rfc.value.trim().toUpperCase(),
        direccion: campos.direccion.value.trim(),
        correo: campos.correo.value.trim(),
        telefono: campos.telefono.value.trim()
    };

    if (
        !datos.nombre ||
        !datos.razon_social ||
        !datos.rfc ||
        !datos.direccion ||
        !datos.correo ||
        !datos.telefono
    ) {
        mostrarMensaje('Completa todos los campos.', 'error');
        return;
    }

    try {

        btnGuardarProveedor.disabled = true;
        btnGuardarProveedor.textContent = 'Guardando...';

        const url = id
            ? `${API_PROVEEDORES}/${encodeURIComponent(id)}`
            : API_PROVEEDORES;

        const respuesta = await fetch(url, {
            method: id ? 'PUT' : 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(datos)
        });

        const resultado = await respuesta.json();

        if (!respuesta.ok || resultado.success === false) {
            throw new Error(
                resultado.message || 'No se pudo guardar el proveedor.'
            );
        }

        mostrarMensaje(
            id
                ? 'Proveedor actualizado correctamente.'
                : 'Proveedor registrado correctamente.',
            'success'
        );

        formularioProveedor.reset();
        campos.id.value = '';

        ocultarFormulario();

        await cargarProveedores();

    } catch (error) {

        console.error('Error:', error);
        mostrarMensaje(error.message, 'error');

    } finally {

        btnGuardarProveedor.disabled = false;
        btnGuardarProveedor.textContent = 'Guardar proveedor';
    }
}


// ================================================
// EDITAR PROVEEDOR
// ================================================

async function editarProveedor(id) {

    try {

        const respuesta = await fetch(
            `${API_PROVEEDORES}/${encodeURIComponent(id)}`
        );

        if (!respuesta.ok) {
            throw new Error('No se encontró el proveedor.');
        }

        const resultado = await respuesta.json();

        const proveedor = resultado.data || resultado;

        campos.id.value = proveedor.id;
        campos.nombre.value = proveedor.nombre || '';
        campos.razon_social.value = proveedor.razon_social || '';
        campos.rfc.value = proveedor.rfc || '';
        campos.direccion.value = proveedor.direccion || '';
        campos.correo.value = proveedor.correo || '';
        campos.telefono.value = proveedor.telefono || '';

        tituloFormulario.textContent = 'Editar proveedor';
        btnGuardarProveedor.textContent = 'Actualizar proveedor';

        mostrarFormulario();

    } catch (error) {

        mostrarMensaje(error.message, 'error');
    }
}


// ================================================
// CONFIRMACIÓN PERSONALIZADA
// ================================================

let resolverConfirmacion = null;

function confirmarEliminacion(nombre) {

    return new Promise((resolve) => {

        if (!modalConfirmarEliminar) {
            mostrarMensaje(
                'No se encontró la ventana de confirmación.',
                'error'
            );
            resolve(false);
            return;
        }

        textoConfirmacion.textContent =
            `¿Estás seguro de que deseas eliminar al proveedor "${nombre}"?`;

        resolverConfirmacion = resolve;

        modalConfirmarEliminar.classList.add('activo');

        btnConfirmarEliminar?.focus();
    });
}


// ================================================
// CERRAR MODAL DE CONFIRMACIÓN
// ================================================

function cerrarModalEliminar(confirmado) {

    if (!modalConfirmarEliminar?.classList.contains('activo')) {
        return;
    }

    modalConfirmarEliminar.classList.remove('activo');

    if (resolverConfirmacion) {
        resolverConfirmacion(confirmado);
        resolverConfirmacion = null;
    }
}


// ================================================
// ELIMINAR PROVEEDOR
// ================================================

async function eliminarProveedor(id) {

    const proveedor = listaProveedores.find(
        p => Number(p.id) === Number(id)
    );

    if (!proveedor) return;

    // Mostrar confirmación personalizada
    const confirmar = await confirmarEliminacion(proveedor.nombre);

    // Si cancela, no se elimina
    if (!confirmar) return;

    try {

        const respuesta = await fetch(
            `${API_PROVEEDORES}/${encodeURIComponent(id)}`,
            { method: 'DELETE' }
        );

        const resultado = await respuesta.json();

        if (!respuesta.ok || resultado.success === false) {
            throw new Error(
                resultado.message || 'No se pudo eliminar el proveedor.'
            );
        }

        mostrarMensaje(
            'Proveedor eliminado correctamente.',
            'success'
        );

        await cargarProveedores();

    } catch (error) {

        mostrarMensaje(error.message, 'error');
    }
}


// ================================================
// ACCIONES DE LA TABLA
// ================================================

function manejarAccionesTabla(evento) {

    const boton = evento.target.closest('button[data-action]');

    if (!boton) return;

    const id = boton.dataset.id;

    if (boton.dataset.action === 'editar') {
        editarProveedor(id);
    }

    if (boton.dataset.action === 'eliminar') {
        eliminarProveedor(id);
    }
}


// ================================================
// BUSCAR PROVEEDORES
// ================================================

function filtrarProveedores() {

    const texto = buscarProveedor.value.trim().toLowerCase();

    const filtrados = listaProveedores.filter(proveedor => {

        return [
            proveedor.nombre,
            proveedor.razon_social,
            proveedor.rfc
        ].some(valor =>
            String(valor || '').toLowerCase().includes(texto)
        );
    });

    mostrarProveedores(filtrados);
}


// ================================================
// FORMULARIO
// ================================================

function mostrarFormulario() {

    seccionFormulario.style.display = 'block';

    seccionFormulario.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
    });
}


function ocultarFormulario() {

    seccionFormulario.style.display = 'none';

    formularioProveedor.reset();
    campos.id.value = '';

    tituloFormulario.textContent = 'Registrar proveedor';
    btnGuardarProveedor.textContent = 'Guardar proveedor';
}


function nuevoProveedor() {

    formularioProveedor.reset();
    campos.id.value = '';

    tituloFormulario.textContent = 'Registrar proveedor';
    btnGuardarProveedor.textContent = 'Guardar proveedor';
}


// ================================================
// RESUMEN
// ================================================

function actualizarResumen() {

    totalProveedores.textContent = listaProveedores.length;
    proveedoresRegistrados.textContent = listaProveedores.length;

    actualizarContador(listaProveedores.length);
}


function actualizarContador(total) {

    contadorProveedores.textContent =
        `Mostrando ${total} proveedor${total !== 1 ? 'es' : ''}`;
}


// ================================================
// MENSAJES
// ================================================

function mostrarMensaje(texto, tipo) {

    clearTimeout(temporizadorMensaje);

    mensajeProveedores.textContent = texto;
    mensajeProveedores.className = `notification ${tipo}`;
    mensajeProveedores.style.display = 'block';

    temporizadorMensaje = setTimeout(() => {
        mensajeProveedores.style.display = 'none';
    }, 4000);
}


// ================================================
// SEGURIDAD: ESCAPAR HTML
// ================================================

function escaparHTML(valor) {

    return String(valor ?? '').replace(/[&<>"']/g, caracter => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    })[caracter]);
}
