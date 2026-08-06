import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { notFound, errorHandler } from "./middleware/error.js";
import { leadsRouter } from "./routes/leads.routes.js";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(compression());
  app.use(express.json({ limit: "256kb" }));
  app.use(
    cors({
      origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type"]
    })
  );
  app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

  app.use("/api", leadsRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

