import express,{Request,Response,NextFunction} from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes";
import tarjetaRoutes from "./routes/tarjeta.routes";
import pagoRoutes from "./routes/pago.routes";
export const app=express();
app.use(cors({
 origin:["http://127.0.0.1:5500","http://localhost:5500","https://cubex-tienda.netlify.app"],
 methods:["GET","POST","DELETE","OPTIONS"],
 allowedHeaders:["Content-Type","Authorization"]
}));
app.use(express.json({limit:"20kb"}));
app.get("/health",(_req,res)=>res.json({servicio:"verificacion-tarjetas",ok:true}));
app.use("/auth",authRoutes);
app.use("/tarjetas",tarjetaRoutes);
app.use("/pagos",pagoRoutes);
app.use((_req,res)=>res.status(404).json({error:"Ruta no encontrada"}));
app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{
 console.error("Error del servicio:",err instanceof Error?err.message:"desconocido");
 res.status(500).json({error:"Error interno del servicio de tarjetas"});
});
