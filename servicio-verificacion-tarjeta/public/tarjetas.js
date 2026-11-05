const $ = (id) => document.getElementById(id);

// ---------- Sesión (comparte el token con el probador de roles) ----------
function mostrarSesion() {
  const token = localStorage.getItem("token");
  const rol = localStorage.getItem("rol");
  $("estado-sesion").textContent = token
    ? `Sesión activa como "${rol}"`
    : "Sin sesión iniciada";
}

async function iniciarSesion(correo, password) {
  const resp = await fetch("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ correo, password }),
  });
  const data = await resp.json();
  if (resp.ok) {
    localStorage.setItem("token", data.token);
    localStorage.setItem("rol", data.usuario.rol);
  } else {
    $("estado-sesion").textContent = "No se pudo iniciar sesión: " + (data.error || resp.status);
    return;
  }
  mostrarSesion();
  cargarTarjetas();
}

$("btn-login-cliente").addEventListener("click", () => iniciarSesion("cliente@tienda.com", "cliente123"));
$("btn-login-admin").addEventListener("click", () => iniciarSesion("admin@tienda.com", "admin123"));
$("btn-salir").addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("rol");
  mostrarSesion();
  $("lista-tarjetas").innerHTML = "";
  llenarSelect([]);
});

// ---------- Utilidades de API ----------
async function api(ruta, opciones = {}) {
  const token = localStorage.getItem("token");
  if (!token) return { ok: false, status: 0, data: { error: "Primero inicia sesión." } };
  try {
    const resp = await fetch(ruta, {
      ...opciones,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(opciones.headers || {}),
      },
    });
    const data = await resp.json();
    return { ok: resp.ok, status: resp.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: "No se pudo conectar con el servidor. ¿Está corriendo npm run dev?" } };
  }
}

function pintar(el, r) {
  el.textContent = `HTTP ${r.status || "—"}\n` + JSON.stringify(r.data, null, 2);
  el.className = "resultado " + (r.ok ? "ok" : "error");
}

// ---------- Tarjetas de prueba ----------
// "esperado" explica qué ve el usuario en cada paso. Los rechazos del banco NO los
// detecta "Solo verificar datos" (que solo revisa el formato): aparecen cuando se
// consulta a la pasarela, es decir, al registrar la tarjeta o al pagar.
const anioFuturo = String(new Date().getFullYear() + 3);
const OK_FORMATO = "✓ Datos válidos (el formato es correcto; el banco no se consulta)";
const PRESETS = [
  { nombre: "Visa válida", numero: "4242 4242 4242 4242", mes: "12", anio: anioFuturo, cvv: "123",
    esperado: { solo: "✓ Datos válidos", registrar: "201 — tarjeta verificada y guardada", pagar: "200 — pago aprobado" } },
  { nombre: "Mastercard válida", numero: "5555 5555 5555 4444", mes: "11", anio: anioFuturo, cvv: "123",
    esperado: { solo: "✓ Datos válidos", registrar: "201 — tarjeta verificada y guardada", pagar: "200 — pago aprobado" } },
  { nombre: "Amex válida (CVV 4)", numero: "3782 822463 10005", mes: "10", anio: anioFuturo, cvv: "1234",
    esperado: { solo: "✓ Datos válidos (CVV de 4 dígitos)", registrar: "201 — tarjeta verificada y guardada", pagar: "200 — pago aprobado" } },
  { nombre: "Número inválido (Luhn)", numero: "4242 4242 4242 4241", mes: "12", anio: anioFuturo, cvv: "123",
    esperado: { solo: "✗ valida:false — falla la verificación Luhn", registrar: "422 — tarjeta inválida (ni llega al banco)", pagar: "No se puede guardar, no hay nada que pagar" } },
  { nombre: "Vencida", numero: "4242 4242 4242 4242", mes: "01", anio: "2020", cvv: "123",
    esperado: { solo: "✗ valida:false — fecha de expiración vencida", registrar: "422 — tarjeta inválida (ni llega al banco)", pagar: "No se puede guardar, no hay nada que pagar" } },
  { nombre: "Rechazada por el banco", numero: "4000 0000 0000 0002", mes: "12", anio: anioFuturo, cvv: "123",
    esperado: { solo: OK_FORMATO, registrar: "402 — tarjeta_rechazada (no se guarda)", pagar: "No llega: no se pudo guardar", banco: true } },
  { nombre: "Fondos insuficientes", numero: "4000 0000 0000 9995", mes: "12", anio: anioFuturo, cvv: "123",
    esperado: { solo: OK_FORMATO, registrar: "402 — fondos_insuficientes (no se guarda)", pagar: "No llega: no se pudo guardar", banco: true } },
  { nombre: "Se registra, pero rechaza al pagar", numero: "4000 0000 0000 0341", mes: "12", anio: anioFuturo, cvv: "123",
    esperado: { solo: OK_FORMATO, registrar: "201 — se guarda sin error (el banco la acepta)", pagar: "402 — tarjeta_rechazada al cobrar (sección 4)", banco: true } },
];

function mostrarEsperado(p) {
  const cont = $("esperado");
  cont.innerHTML = "";
  const titulo = document.createElement("div");
  titulo.className = "titulo";
  titulo.textContent = `Qué esperar con "${p.nombre}"`;
  cont.appendChild(titulo);
  [
    ["Solo verificar datos", p.esperado.solo, false],
    ["Verificar y registrar", p.esperado.registrar, p.esperado.banco && !p.esperado.registrar.startsWith("201")],
    ["Verificar en el pago", p.esperado.pagar, p.esperado.banco && p.esperado.pagar.startsWith("402")],
  ].forEach(([donde, texto, esBanco]) => {
    const f = document.createElement("div");
    f.className = "fila" + (esBanco ? " banco" : "");
    const a = document.createElement("span");
    a.className = "donde";
    a.textContent = donde;
    const b = document.createElement("span");
    b.textContent = texto;
    f.appendChild(a);
    f.appendChild(b);
    cont.appendChild(f);
  });
  cont.classList.add("visible");
}

PRESETS.forEach((p) => {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = p.nombre;
  b.addEventListener("click", () => {
    $("numero").value = p.numero;
    $("mes").value = p.mes;
    $("anio").value = p.anio;
    $("cvv").value = p.cvv;
    mostrarEsperado(p);
    $("nota-banco").classList.remove("visible");
    $("checklist").innerHTML = "";
    $("resultado-tarjeta").textContent = "";
    $("resultado-tarjeta").className = "resultado";
  });
  $("presets").appendChild(b);
});

function datosFormulario() {
  return {
    numero: $("numero").value,
    mes: $("mes").value,
    anio: $("anio").value,
    cvv: $("cvv").value,
  };
}

const ETIQUETAS = {
  formatoNumero: "Formato del número (solo dígitos)",
  luhn: "Verificación Luhn",
  marcaYLongitud: "Marca soportada y longitud correcta",
  expiracion: "Fecha de expiración vigente",
  cvv: "CVV con formato correcto",
};

function pintarChecklist(verificaciones, marca) {
  const cont = $("checklist");
  cont.innerHTML = "";
  if (!verificaciones) return;
  const cab = document.createElement("div");
  cab.textContent = `Marca detectada: ${marca}`;
  cab.style.fontWeight = "600";
  cont.appendChild(cab);
  Object.entries(ETIQUETAS).forEach(([clave, texto]) => {
    const d = document.createElement("div");
    const ok = verificaciones[clave];
    d.className = "item " + (ok ? "ok" : "mal");
    d.textContent = (ok ? "✓ " : "✗ ") + texto;
    cont.appendChild(d);
  });
}

// ---------- Verificar / registrar ----------
$("btn-verificar").addEventListener("click", async () => {
  const r = await api("/tarjetas/verificar", { method: "POST", body: JSON.stringify(datosFormulario()) });
  pintar($("resultado-tarjeta"), { ...r, ok: r.ok && r.data.valida });
  pintarChecklist(r.data.verificaciones, r.data.marca);
  // Aviso: esta comprobación es local; el banco no interviene
  const nota = $("nota-banco");
  if (r.ok && r.data.valida) {
    nota.textContent = "Solo se validó el formato de los datos. El banco NO se consultó: " +
      "un rechazo del banco o una falta de fondos solo aparece al pulsar " +
      "\"Verificar y registrar tarjeta\" o al pagar (sección 4).";
    nota.classList.add("visible");
  } else {
    nota.classList.remove("visible");
  }
});

$("btn-registrar").addEventListener("click", async () => {
  const r = await api("/tarjetas", { method: "POST", body: JSON.stringify(datosFormulario()) });
  pintar($("resultado-tarjeta"), r);
  pintarChecklist(r.data.verificaciones, r.data.marca);
  $("nota-banco").classList.remove("visible");
  if (r.ok) {
    $("cvv").value = ""; // el CVV no se conserva
    cargarTarjetas();
  }
});

// ---------- Lista de tarjetas ----------
let tarjetasCache = [];

function llenarSelect(tarjetas) {
  const sel = $("sel-tarjeta");
  sel.innerHTML = "";
  if (!tarjetas.length) {
    sel.innerHTML = '<option value="">— registra una tarjeta primero —</option>';
    return;
  }
  tarjetas.forEach((t) => {
    const o = document.createElement("option");
    o.value = t.id;
    o.textContent = `${t.marca} ${t.mascara}`;
    sel.appendChild(o);
  });
}

async function cargarTarjetas() {
  const cont = $("lista-tarjetas");
  const r = await api("/tarjetas");
  if (!r.ok) {
    cont.innerHTML = "";
    const p = document.createElement("div");
    p.className = "resultado error";
    p.textContent = `HTTP ${r.status || "—"}  ${r.data.error || ""}`;
    cont.appendChild(p);
    llenarSelect([]);
    return;
  }
  tarjetasCache = r.data.tarjetas;
  llenarSelect(tarjetasCache);
  cont.innerHTML = "";
  if (!tarjetasCache.length) {
    cont.textContent = "Aún no tienes tarjetas guardadas.";
    return;
  }
  tarjetasCache.forEach((t) => {
    const fila = document.createElement("div");
    fila.className = "item-lista";

    const info = document.createElement("div");
    const titulo = document.createElement("strong");
    titulo.textContent = `${t.marca} ${t.mascara}`;
    if (t.vencida) {
      const tag = document.createElement("span");
      tag.className = "insignia";
      tag.textContent = "vencida";
      titulo.appendChild(tag);
    }
    const detalle = document.createElement("small");
    detalle.textContent = `Vence ${String(t.mesExpiracion).padStart(2, "0")}/${t.anioExpiracion} · id ${t.id} · ${t.verificada ? "verificada" : "sin verificar"}`;
    info.appendChild(titulo);
    info.appendChild(detalle);

    const acciones = document.createElement("div");
    acciones.className = "acciones";
    const usar = document.createElement("button");
    usar.type = "button";
    usar.textContent = "Usar";
    usar.addEventListener("click", () => { $("sel-tarjeta").value = String(t.id); });
    const borrar = document.createElement("button");
    borrar.type = "button";
    borrar.className = "peligro";
    borrar.textContent = "Eliminar";
    borrar.addEventListener("click", async () => {
      const rr = await api(`/tarjetas/${t.id}`, { method: "DELETE" });
      pintar($("resultado-tarjeta"), rr);
      cargarTarjetas();
    });
    acciones.appendChild(usar);
    acciones.appendChild(borrar);

    fila.appendChild(info);
    fila.appendChild(acciones);
    cont.appendChild(fila);
  });
}

$("btn-listar").addEventListener("click", cargarTarjetas);

// ---------- Pedidos pendientes ----------
$("btn-pedidos").addEventListener("click", async () => {
  const cont = $("lista-pedidos");
  const r = await api("/pagos/pedidos-pendientes");
  cont.innerHTML = "";
  if (!r.ok) {
    const p = document.createElement("div");
    p.className = "resultado error";
    p.textContent = `HTTP ${r.status || "—"}  ${r.data.error || ""}`;
    cont.appendChild(p);
    return;
  }
  if (!r.data.pedidos.length) {
    cont.textContent = "No hay pedidos pendientes de pago con tarjeta (corre npm run prisma:seed para crear uno de ejemplo).";
    return;
  }
  r.data.pedidos.forEach((p) => {
    const fila = document.createElement("div");
    fila.className = "item-lista";
    const info = document.createElement("div");
    const t = document.createElement("strong");
    t.textContent = `Pedido #${p.id} — $${p.monto.toFixed(2)}`;
    const d = document.createElement("small");
    d.textContent = p.articulos.map((a) => `${a.cantidad} × ${a.producto}`).join(", ") + ` · ${p.tipoEntrega}`;
    info.appendChild(t);
    info.appendChild(d);
    const usar = document.createElement("button");
    usar.type = "button";
    usar.textContent = "Usar";
    usar.addEventListener("click", () => { $("id-pedido").value = String(p.id); });
    fila.appendChild(info);
    fila.appendChild(usar);
    cont.appendChild(fila);
  });
});

// ---------- Verificar al pagar ----------
$("btn-pagar").addEventListener("click", async () => {
  const body = {
    idTarjeta: $("sel-tarjeta").value,
    cvv: $("cvv-pago").value,
  };
  const idPedido = $("id-pedido").value.trim();
  if (idPedido) body.idPedido = idPedido;

  const r = await api("/pagos/verificar-tarjeta", { method: "POST", body: JSON.stringify(body) });
  pintar($("resultado-pago"), r);
  $("cvv-pago").value = "";
});

mostrarSesion();
if (localStorage.getItem("token")) cargarTarjetas();
