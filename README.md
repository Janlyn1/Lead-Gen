# TikTok Lead Collector Pro

A Chrome Extension plus Node/Express backend for saving qualified TikTok creator leads into Google Sheets while the user browses TikTok manually.

The extension does not auto-scroll, like, follow, comment, or control TikTok browsing. It only reads the visible creator profile, checks the follower range, and saves qualified profiles when the user clicks SAVE or enables Auto Save Mode.

## What is included

- Chrome Extension Manifest V3 overlay for TikTok profiles
- Draggable dark floating panel
- Manual SAVE and optional Auto Save Mode
- Follower qualification filter with configurable min/max
- Duplicate detection through the backend
- Keyboard shortcuts: `S` to save, `X` to skip
- Saved Today counter, Daily Goal, optional Notes, Recently Saved list
- Node/Express REST API
- Google Sheets API integration
- Sheet worker that expands links from `Extension Link` into `Expand Link`
- Regex/keyword bio parser plus Gemini fallback
- Parser tests

## Google Sheets Structure

The backend creates or repairs these sheets:

`Extension Link`

| TikTok URL |
| --- |

`Expand Link`

| Full Name | TikTok Profile Link | Follower Count | Content Category | Location | Business \| Contact Email | Date | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

`Existing`

Use this sheet for creators you already collected before using the extension. Paste old creators here with the same columns as `Expand Link`. Duplicate detection checks this sheet too, so an existing creator cannot be saved again.

| Full Name | TikTok Profile Link | Follower Count | Content Category | Location | Business \| Contact Email | Date | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |

## Setup

1. Install backend dependencies:

```bash
cd backend
npm install
```

2. Copy the environment file:

```bash
cp ../.env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item ..\.env.example .env
```

3. Fill in `.env`.

Keep the Gemini API key in `GEMINI_API_KEY`. Do not put real keys in source control.

4. Configure Google Sheets access.

Recommended if service account key creation is blocked: use the included Apps Script Web App.

1. Open the Google Sheet.
2. Click Extensions > Apps Script.
3. Paste the contents of `apps-script/Code.gs`.
4. Click Project Settings.
5. Add Script properties:

```text
WEBHOOK_SECRET=make-a-long-random-secret
SPREADSHEET_ID=1Rerd3RwZfpt4qcuKHvOjAXFG0W-P69QmGfyBY-1zVq0
```

6. Click Deploy > New deployment.
7. Select type: Web app.
8. Execute as: Me.
9. Who has access: Anyone.
10. Click Deploy, approve permissions, and copy the Web app URL ending in `/exec`.

Then set these backend environment variables:

```text
APPS_SCRIPT_WEB_APP_URL=https://script.google.com/macros/s/.../exec
APPS_SCRIPT_SECRET=the-same-secret-from-WEBHOOK_SECRET
```

Alternative: create a Google Cloud service account, enable Google Sheets API for the project, download the JSON key as `backend/service-account.json`, then share the Google Sheet with the service account email as Editor.

The provided Sheet ID is already placed in `.env.example`:

```text
SPREADSHEET_ID=1Rerd3RwZfpt4qcuKHvOjAXFG0W-P69QmGfyBY-1zVq0
```

5. Initialize the sheet tabs:

```bash
npm run init:sheets
```

6. Start the backend:

```bash
npm start
```

The API will run at:

```text
http://localhost:3000
```

## Install the Chrome Extension

1. Open Chrome.
2. Go to `chrome://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the `extension` folder from this project.
6. Open the extension popup and confirm the backend URL is `http://localhost:3000`.
7. Visit `https://www.tiktok.com/`, open a creator profile, and use the floating panel.

## Backend API

Health:

```http
GET /api/health
```

Check duplicate:

```http
GET /api/leads/status?url=https://www.tiktok.com/@creator&username=creator
```

Save lead:

```http
POST /api/leads
Content-Type: application/json

{
  "tiktokUrl": "https://www.tiktok.com/@creator",
  "username": "creator",
  "followers": 8500,
  "bio": "Beauty Creator\nBusiness: hello@example.com\nManila",
  "notes": "Good beauty creator"
}
```

Run worker manually:

```http
POST /api/worker/run
```

## How Processing Works

1. The extension detects a TikTok profile URL, username, follower count, and bio from the visible page.
2. The extension checks whether the follower count is within the configured range.
3. On save, the backend checks for duplicates by TikTok URL and username.
4. The backend appends only the TikTok URL to `Extension Link`.
5. The backend uses the profile snapshot from the extension, or a lightweight TikTok HTML fetch when needed, to enrich the creator.
6. The parser extracts email, socials, location, and category.
7. If parsing confidence is low and `GEMINI_API_KEY` is configured, Gemini attempts a structured JSON extraction.
8. The backend appends enriched lead data to `Expand Link`.

## Deployment

Backend deployment options:

- Render, Railway, Fly.io, Cloud Run, or any Node.js host
- Set all `.env` values as hosting secrets
- Set `CORS_ORIGIN` to your Chrome extension origin after loading the extension
- Prefer `APPS_SCRIPT_WEB_APP_URL` and `APPS_SCRIPT_SECRET` when service account keys are blocked
- Or keep `GOOGLE_APPLICATION_CREDENTIALS` as a mounted secret file or use `GOOGLE_SERVICE_ACCOUNT_EMAIL` and `GOOGLE_PRIVATE_KEY`

Chrome extension deployment:

- For local use, load the `extension` folder unpacked
- For Chrome Web Store, add production icons, a privacy policy, and set host permissions to only your production API domain plus TikTok

## Testing

Run parser tests:

```bash
cd backend
npm test
```

Run syntax checks:

```bash
cd backend
npm run check
```

Manual smoke test:

1. Start the backend.
2. Load the extension unpacked.
3. Open a TikTok profile with 2,000 to 20,000 followers.
4. Click SAVE.
5. Confirm `Extension Link` receives only the TikTok URL.
6. Confirm `Expand Link` receives the enriched row.

## Notes

- TikTok HTML changes can break server-side profile fetching. The extension profile snapshot is the preferred source because it reads the page already visible to the user.
- Saved Today and Recently Saved are operational counters stored locally by the backend, because `Extension Link` intentionally stores only URLs.
- The backend uses the official Google Sheets append flow and the official Google GenAI SDK pattern.

References:

- Google Sheets API append documentation: https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append
- Google Sheets Node.js quickstart: https://developers.google.com/workspace/sheets/api/quickstart/nodejs
- Gemini API JavaScript SDK documentation: https://ai.google.dev/gemini-api/docs/generate-content/get-started
