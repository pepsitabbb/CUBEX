export interface TokenPayload {
  sub: string;
  nombreUsuario?: string;
  rol?: string;
  email?: string | null;
  iat?: number;
  exp?: number;
  iss?: string;
}
export interface JwtPayload {
  idUsuario: number;
  nombreUsuario: string;
  correo: string;
  nombreRol: string;
}
declare global {
  namespace Express {
    interface Request { usuario?: JwtPayload; }
  }
}
