const fallos = new Map<number, number[]>();
function vigentes(id: number): number[] {
  const ventana = (Number(process.env.VENTANA_INTENTOS_MIN) || 10) * 60000;
  const lista = (fallos.get(id) || []).filter(t => t > Date.now() - ventana);
  fallos.set(id, lista); return lista;
}
export function registrarFallo(id: number): void { const l = vigentes(id); l.push(Date.now()); fallos.set(id,l); }
export function estadoBloqueo(id: number): { bloqueado: boolean; reintentarEnSeg: number } {
  const max = Number(process.env.MAX_INTENTOS_TARJETA) || 10;
  const ventana = (Number(process.env.VENTANA_INTENTOS_MIN) || 10) * 60000;
  const l = vigentes(id);
  if (l.length < max) return { bloqueado:false, reintentarEnSeg:0 };
  return { bloqueado:true, reintentarEnSeg:Math.max(1,Math.ceil((l[0]+ventana-Date.now())/1000)) };
}
