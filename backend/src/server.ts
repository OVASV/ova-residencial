import "dotenv/config";
import { createApp } from "./app.js";

const PORT = Number(process.env.PORT ?? 3002);

const app = createApp();

// Red de seguridad: un error no atrapado en una ruta no debe tumbar el servidor.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

app.listen(PORT, () => {
  console.log(`OVA Residencial API escuchando en http://localhost:${PORT}`);
  console.log(`Health:  http://localhost:${PORT}/api/v1/health`);
});
