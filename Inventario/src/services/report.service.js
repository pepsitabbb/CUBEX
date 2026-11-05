
export class ValidationError extends Error {}

export function parseFilters(query) {
  const allowed = new Set(['stockBajo']);

  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) {
      throw new ValidationError(`Filtro desconocido: ${key}`);
    }
  }

  const filters = {};

  if (query.stockBajo !== undefined) {
    if (!['true', 'false'].includes(query.stockBajo)) {
      throw new ValidationError('stockBajo debe ser true o false');
    }

    filters.stockBajo = query.stockBajo === 'true';
  }

  return filters;
}

function cents(value) {
  const [whole, fraction = ''] = String(value ?? '0').split('.');
  return BigInt(whole) * 100n +
    BigInt(fraction.padEnd(2, '0').slice(0, 2));
}

function money(value) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;

  const result =
    `${absolute / 100n}.${String(absolute % 100n).padStart(2, '0')}`;

  return negative ? `-${result}` : result;
}

export function createReportService(repository) {
  return {
    async generate(filters = {}) {
      const rows = await repository.findProducts(filters);

      let total = 0n;
      let units = 0n;

      const productos = rows.map(row => {
        const stock = Number(row.stock ?? 0);
        const minimo = Number(row.stockMinimo ?? 0);
        const maximo = Number(row.stockMaximo ?? 0);

        const precio = cents(row.precioUnitario);
        const valor = precio * BigInt(stock);

        total += valor;
        units += BigInt(stock);

        const stockBajo = stock <= minimo;
        const stockExcedido = maximo > 0 && stock >= maximo;

        let estado = 'Normal';

        if (stockBajo) {
          estado = 'Stock bajo';
        } else if (stockExcedido) {
          estado = 'Stock excedido';
        }

        return {
          ...row,
          stock,
          stockMinimo: minimo,
          stockMaximo: maximo,
          precioUnitario: money(precio),
          valorTotal: money(valor),
          stockBajo,
          stockExcedido,
          estado
        };
      });

      return {
        generadoEn: new Date().toISOString(),

        filtros: {
          stockBajo: filters.stockBajo ?? false
        },

        resumen: {
          totalProductos: productos.length,
          totalUnidades: units.toString(),
          valorInventario: money(total),

          productosStockBajo:
            productos.filter(p => p.stockBajo).length,

          productosStockExcedido:
            productos.filter(p => p.stockExcedido).length,

          productosStockNormal:
            productos.filter(p => !p.stockBajo && !p.stockExcedido).length,

          productosSinStock:
            productos.filter(p => p.stock === 0).length
        },

        productos
      };
    }
  };
}
