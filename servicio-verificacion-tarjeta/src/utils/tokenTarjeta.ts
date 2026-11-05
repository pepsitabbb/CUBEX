import { createHmac, timingSafeEqual } from "crypto";
import { MarcaTarjeta } from "./tarjeta";
const secret = process.env.JWT_SECRET;
if (!secret) throw new Error("Falta JWT_SECRET");
interface MetaTarjeta { v: 1; marca: MarcaTarjeta; mes: number; anio: number; }
export function crearTokenTarjeta(meta: MetaTarjeta): string {
  const data = Buffer.from(JSON.stringify(meta)).toString("base64url");
  const sig = createHmac("sha256", secret!).update(data).digest("base64url").slice(0,32);
  const token = `v1.${data}.${sig}`;
  if (token.length > 255) throw new Error("Metadatos de tarjeta exceden el tamaño permitido");
  return token;
}
export function leerTokenTarjeta(token: string): MetaTarjeta | null {
  try {
    const [version,data,signature] = token.split(".");
    if (version !== "v1" || !data || !signature) return null;
    const expected = createHmac("sha256", secret!).update(data).digest("base64url").slice(0,32);
    const a=Buffer.from(signature), b=Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a,b)) return null;
    const value=JSON.parse(Buffer.from(data,"base64url").toString("utf8"));
    if (value.v !== 1 || typeof value.marca !== "string" || !Number.isInteger(value.mes) || !Number.isInteger(value.anio)) return null;
    return value as MetaTarjeta;
  } catch { return null; }
}
