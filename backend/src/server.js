import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { leadProcessor } from "./services/leadProcessor.service.js";
import { sheetsService } from "./services/sheets.service.js";

const app = createApp();

const server = app.listen(env.PORT, async () => {
  console.log(`TikTok Lead Collector API listening on http://localhost:${env.PORT}`);
  try {
    await sheetsService.ensureStructure();
    leadProcessor.start(env.SHEET_POLL_INTERVAL_MS);
  } catch (error) {
    console.warn(`Sheets startup check skipped/failed: ${error.message}`);
  }
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});

export { app, server };
