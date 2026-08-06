import { sheetsService } from "../services/sheets.service.js";

await sheetsService.ensureStructure();
console.log("Google Sheets structure is ready.");

