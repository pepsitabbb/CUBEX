// Cambia este valor si tu API corre en otro puerto
// (revisa la consola al hacer "dotnet run" para confirmar el puerto)
const API_BASE_URL = "http://localhost:5000/api/productos";

const form = document.getElementById("form-producto");
const mensajeDiv = document.getElementById("mensaje");
const tablaBody = document.querySelector("#tabla-productos tbody");

form.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const producto = {
    nombre: document.getElementById("nombre").value,
    descripcion: document.getElementById("descripcion").value || null,
    lote: document.getElementById("lote").value || null,
    serie: document.getElementById("serie").value || null,
    caducidad: document.getElementById("caducidad").value || null,
    idProveedor: Number(document.getElementById("idProveedor").value),
    costo: Number(document.getElementById("costo").value),
    precio: Number(document.getElementById("precio").value),
    stockActual: Number(document.getElementById("stockActual").value),
    stockMinimo: Number(document.getElementById("stockMinimo").value),
    stockMaximo: Number(document.getElementById("stockMaximo").value),
  };

  try {
    const respuesta = await fetch(API_BASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(producto),
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mostrarMensaje(
        `Error: ${datos.detalles ? datos.detalles.join(", ") : "No se pudo agregar el producto."}`,
        "error"
      );
      return;
    }

    mostrarMensaje(`Producto agregado correctamente (id: ${datos.id})`, "exito");
    form.reset();
    cargarProductos();
  } catch (error) {
    mostrarMensaje("No se pudo conectar con la API. ¿Está corriendo el backend?", "error");
    console.error(error);
  }
});

document.getElementById("btn-refrescar").addEventListener("click", cargarProductos);

async function cargarProductos() {
  try {
    const respuesta = await fetch(API_BASE_URL);
    const productos = await respuesta.json();

    tablaBody.innerHTML = "";
    for (const producto of productos) {
      const fila = document.createElement("tr");
      fila.innerHTML = `
        <td>${producto.id}</td>
        <td>${producto.nombre}</td>
        <td>${producto.idProveedor}</td>
        <td>$${producto.costo}</td>
        <td>$${producto.precio}</td>
        <td>${producto.stockActual}</td>
      `;
      tablaBody.appendChild(fila);
    }
  } catch (error) {
    console.error("No se pudo cargar la lista de productos:", error);
  }
}

function mostrarMensaje(texto, tipo) {
  mensajeDiv.textContent = texto;
  mensajeDiv.className = tipo;
}

// Cargar la lista al abrir la página
cargarProductos();
