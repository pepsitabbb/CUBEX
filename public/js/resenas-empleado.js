
const API_RESENAS_EMPLEADO = CUBEX_CONFIG.API.RESENAS;

const listaResenasEmpleado = document.getElementById(
    "listaResenasEmpleado"
);

const mensajeResenasEmpleado = document.getElementById(
    "mensajeResenasEmpleado"
);

const actualizarResenas = document.getElementById(
    "actualizarResenas"
);

async function cargarResenasEmpleado() {
    listaResenasEmpleado.innerHTML = `
        <tr>
            <td colspan="5" class="vacio">Cargando reseñas...</td>
        </tr>
    `;

    try {
        const respuesta = await fetch(API_RESENAS_EMPLEADO);

        if (!respuesta.ok) {
            throw new Error("No se pudieron consultar las reseñas.");
        }

        const resultado = await respuesta.json();

        const resenas = Array.isArray(resultado)
            ? resultado
            : resultado.resenas || resultado.data || [];

        if (resenas.length === 0) {
            listaResenasEmpleado.innerHTML = `
                <tr>
                    <td colspan="5" class="vacio">
                        No hay reseñas para mostrar.
                    </td>
                </tr>
            `;
            return;
        }

        listaResenasEmpleado.innerHTML = resenas.map(resena => {
            const producto = resena.nombre_producto ||
                resena.producto_nombre ||
                resena.producto ||
                "Producto #" + (resena.id_producto || "");

            const cliente = resena.nombre_cliente ||
                resena.cliente_nombre ||
                resena.cliente ||
                "Cliente";

            const calificacion = Number(
                resena.calificacion || resena.estrellas || resena.rating || 0
            );

            const comentario = resena.comentario ||
                resena.descripcion ||
                "Sin comentario";

            const fecha = resena.fecha
                ? new Date(resena.fecha).toLocaleDateString("es-MX")
                : "Sin fecha";

            return `
                <tr>
                    <td>${escaparHTML(producto)}</td>
                    <td>${escaparHTML(cliente)}</td>
                    <td>
                        <span class="estrellas">
                            ${"★".repeat(Math.min(5, Math.max(0, calificacion)))}
                        </span>
                        (${calificacion}/5)
                    </td>
                    <td>${escaparHTML(comentario)}</td>
                    <td>${escaparHTML(fecha)}</td>
                </tr>
            `;
        }).join("");

    } catch (error) {
        console.error("Error al cargar reseñas:", error);

        listaResenasEmpleado.innerHTML = `
            <tr>
                <td colspan="5" class="vacio">
                    No fue posible cargar las reseñas.
                </td>
            </tr>
        `;

        mensajeResenasEmpleado.textContent =
            "Verifica que el microservicio de reseñas esté funcionando.";
    }
}

function escaparHTML(valor) {
    return String(valor).replace(/[&<>"']/g, caracter => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[caracter]);
}

actualizarResenas.addEventListener("click", cargarResenasEmpleado);

cargarResenasEmpleado();
