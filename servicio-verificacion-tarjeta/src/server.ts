import "dotenv/config";
import { app } from "./app";
import { prisma } from "./config/prisma";
const PORT=Number(process.env.PORT||3024);
const server=app.listen(PORT,()=>console.log(`Servicio de verificación de tarjetas en http://localhost:${PORT}`));
async function cerrar(){server.close();await prisma.$disconnect();process.exit(0);}
process.on("SIGINT",cerrar);process.on("SIGTERM",cerrar);
