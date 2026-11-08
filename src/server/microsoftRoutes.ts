import type { FastifyInstance } from "fastify";
import { disconnect, msStatus, startConnect } from "../connectors/microsoft.js";

export function registerMicrosoft(app: FastifyInstance): void {
  app.get("/api/ms/status", async () => msStatus());
  app.post("/api/ms/connect", async () => startConnect());
  app.post("/api/ms/disconnect", async () => { disconnect(); return msStatus(); });
}
