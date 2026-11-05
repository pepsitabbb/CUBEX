export function errorHttp(status, message) {
  return Object.assign(new Error(message), { status });
}

export function entero(value, nombre, max = 2147483647) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    throw errorHttp(400, `${nombre} debe ser un entero positivo.`);
  }
  const numero = Number(value);
  if (!Number.isSafeInteger(numero) || numero > max) {
    throw errorHttp(400, `${nombre} supera el máximo permitido (${max}).`);
  }
  return numero;
}

function fecha(value, nombre) {
  if (value === undefined) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw errorHttp(400, `${nombre} debe tener formato YYYY-MM-DD.`);
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (value < '1000-01-01' || Number.isNaN(parsed.getTime()) ||
      parsed.toISOString().slice(0, 10) !== value) {
    throw errorHttp(400, `${nombre} no es una fecha válida.`);
  }
  return value;
}

export function filtros(query, paginar = false) {
  const permitidos = ['desde', 'hasta', 'proveedorId'];
  if (paginar) permitidos.push('pagina', 'limite');
  for (const key of Object.keys(query)) {
    if (!permitidos.includes(key)) throw errorHttp(400, `Parámetro desconocido: ${key}.`);
  }
  const resultado = {
    desde: fecha(query.desde, 'desde'),
    hasta: fecha(query.hasta, 'hasta'),
    proveedorId: query.proveedorId === undefined ? null : entero(query.proveedorId, 'proveedorId')
  };
  if (resultado.desde && resultado.hasta && resultado.desde > resultado.hasta) {
    throw errorHttp(400, 'desde no puede ser posterior a hasta.');
  }
  if (paginar) {
    resultado.pagina = query.pagina === undefined ? 1 : entero(query.pagina, 'pagina', 1000000);
    resultado.limite = query.limite === undefined ? 20 : entero(query.limite, 'limite', 100);
  }
  return resultado;
}
