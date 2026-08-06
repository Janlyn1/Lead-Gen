import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { z } from "zod";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });
dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });
dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  CORS_ORIGIN: z.string().default("*"),
  SPREADSHEET_ID: z.string().min(10),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3.6-flash"),
  TIKTOK_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  SHEET_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60000)
});

export const env = envSchema.parse(process.env);

export const hasGoogleCredentials = Boolean(
  env.GOOGLE_APPLICATION_CREDENTIALS ||
    (env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY)
);
