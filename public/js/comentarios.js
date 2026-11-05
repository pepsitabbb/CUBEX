
const API_RESENAS = CUBEX_CONFIG.API.RESENAS;

const token = sessionStorage.getItem("cubex_token");

const contenedorResenas = document.getElementById("contenedorResenas");
const totalResenas = document.getElementById("totalResenas");
const mensajeResenas = document.getElementById("mensajeResenas");
const btnActualizar = document.getElementById("btnActualizar");

// Detectar si estamos en el panel del empleado.
// El empleado.html debe tener el elemento contenedorResenas.
const esEmpleado = /empleado\.html$/i.test(window.location.pathname);

// Evitar errores si la página no tiene la sección de reseñas.
if (contenedorResenas && totalResenas) {

    function escaparHTML(texto) {
        return String(texto ?? "").replace(/[&<>"']/g, caracter => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[caracter]);
    }

    async function cargarResenas() {

        const columnas = esEmpleado ? 5 : 6;

        contenedorResenas.innerHTML = `
            <tr>
                <td colspan="${columnas}" style="text-align:center;">
                    Cargando reseñas...
                </td>
            </tr>
        `;

        if (mensajeResenas) {
            mensajeResenas.textContent = "";
        }

        try {
            const respuesta = await fetch(API_RESENAS);
            const resultado = await respuesta.json();

            if (!respuesta.ok) {
                throw new Error(
                    resultado.mensaje || "No se pudieron consultar las reseñas."
                );
            }

            const resenas = Array.isArray(resultado)
                ? resultado
                : resultado.datos || resultado.resenas || resultado.data || [];

            if (!Array.isArray(resenas)) {
                throw new Error("La respuesta del servicio no tiene el formato esperado.");
            }

            totalResenas.textContent = `${resenas.length} reseñas`;

            if (resenas.length === 0) {
                contenedorResenas.innerHTML = `
                    <tr>
                        <td colspan="${columnas}" style="text-align:center;">
                            No hay reseñas para mostrar.
                        </td>
                    </tr>
                `;
                return;
            }

            contenedorResenas.innerHTML = resenas.map(resena => {

                const calificacion = Math.max(
                    0,
                    Math.min(5, Number(resena.calificacion) || 0)
                );

                const estrellas = "⭐".repeat(calificacion);

                const fecha = resena.fecha
                    ? new Date(resena.fecha).toLocaleDateString("es-MX")
                    : "--";

                return `
                    <tr>
                        <td>
                            ${escaparHTML(
                                resena.nombre_producto ||
                                `Producto #${resena.id_producto}`
                            )}
                        </td>

                        <td>
                            ${escaparHTML(resena.nombre_usuario || "Cliente")}
                        </td>

                        <td>
                            <span class="calificacion">
                                ${estrellas} (${calificacion}/5)
                            </span>
                        </td>

                        <td>
                            ${escaparHTML(resena.comentario)}
                        </td>

                        <td>
                            ${escaparHTML(fecha)}
                        </td>

                        ${!esEmpleado ? `
                            <td>
                                <button
                                    type="button"
                                    class="boton-eliminar-resena"
                                    data-id="${escaparHTML(resena.id)}">
                                    Eliminar
                                </button>
                            </td>
                        ` : ""}
                    </tr>
                `;

            }).join("");

        } catch (error) {
            console.error("Error al cargar reseñas:", error);

            totalResenas.textContent = "Error";

            contenedorResenas.innerHTML = `
                <tr>
                    <td colspan="${columnas}" style="text-align:center;">
                        No se pudieron cargar las reseñas.
                    </td>
                </tr>
            `;

            if (mensajeResenas) {
                mensajeResenas.textContent = error.message;
            }
        }
    }

    // Esta función solo se utiliza desde el administrador.
    async function eliminarResena(id) {

        if (esEmpleado) return;

const confirmar = await window.parent.confirmarEliminacionResena();

if (!confirmar) return;

        try {
            const respuesta = await fetch(
                `${API_RESENAS}/${encodeURIComponent(id)}`,
                {
                    method: "DELETE",
                    headers: {
                        "Authorization": `Bearer ${token}`
                    }
                }
            );

            const resultado = await respuesta.json().catch(() => ({}));

            if (!respuesta.ok) {
                throw new Error(
                    resultado.mensaje || "No se pudo eliminar la reseña."
                );
            }

            

            await cargarResenas();

        } catch (error) {
            console.error("Error al eliminar reseña:", error);
            alert(error.message);
        }
    }

    // Activar eliminación únicamente en el administrador.
    if (!esEmpleado) {
        contenedorResenas.addEventListener("click", evento => {

            const boton = evento.target.closest(".boton-eliminar-resena");

            if (!boton) return;

            eliminarResena(boton.dataset.id);
        });
    }

    // Actualizar solo si existe el botón (administrador).
    if (btnActualizar) {
        btnActualizar.addEventListener("click", cargarResenas);
    }

    cargarResenas();
}
