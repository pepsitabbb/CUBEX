interface Linea { cantidad: number; productos: { precio: { toString(): string } }; }
export function calcularMonto(detalle: Linea[]): number {
  return Math.round(detalle.reduce((s,l)=>s+Number(l.productos.precio.toString())*l.cantidad,0)*100)/100;
}
