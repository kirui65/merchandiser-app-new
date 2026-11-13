# Deployment runbook

## Backend on Render

Create a **Web Service** from this repository in the Render dashboard.

- Root directory: `backend`
- Runtime: Node
- Build command: `npm ci`
- Start command: `npm start`
- Health check path: `/health`
- Node environment: `production`

Add these environment variables as Render secrets (do not commit them):

- `JWT_SECRET` — a new long random production secret.
- `JWT_EXPIRES_IN` — normally `7d`.
- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` — paste the full service-account private key; Render may store line breaks as literal `\n`, which the application supports.
- `FIREBASE_STORAGE_BUCKET`
- `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE`, `DARAJA_PASSKEY`, `DARAJA_CALLBACK_URL`, `DARAJA_CALLBACK_TOKEN`, and `DARAJA_ENV` when M-Pesa is enabled. Set `DARAJA_CALLBACK_URL` to `https://<render-service>.onrender.com/api/mpesa/callback`.
- `RECONCILIATION_WINDOW_MINUTES` — normally `15`.
- `GEOFENCE_RADIUS_METERS` — normally `100`.
- `OUTLET_OVERDUE_DAYS` — normally `7`.
- `ALLOWED_ORIGINS` — initially the eventual Vercel URL, for example `https://brandsphere-dashboard.vercel.app`. Multiple origins are comma-separated.
- `GEMINI_API_KEY` — optional Google AI Studio key for the protected manager dashboard assistant. Keep it as a Render secret; never add it to the dashboard environment or source control.
- `GEMINI_MODEL` — optional Gemini model name; defaults to `gemini-2.0-flash`.

Render supplies `PORT`; do not set it. After deploy, verify `https://<render-service>.onrender.com/health` returns `{ "status": "ok" }`.

## Dashboard on Vercel

Vercel is recommended: this is a plain Vite SPA, and `admin-dashboard/vercel.json` provides the history-route fallback required by React Router.

Import the same Git repository into Vercel and configure:

- Root Directory: `admin-dashboard`
- Framework Preset: Vite
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment variable: `VITE_API_URL=https://<render-service>.onrender.com/api`

Deploy, then copy Vercel's production URL into Render's `ALLOWED_ORIGINS` and redeploy the Render service. Do not include a trailing slash in either URL.

## After both URLs exist

Add a local, ignored `admin-dashboard/.env.production` with the exact deployed API URL if you need to reproduce a production build locally:

```dotenv
VITE_API_URL=https://<render-service>.onrender.com/api
```

Set the mobile EAS preview profile's `EXPO_PUBLIC_API_URL` to that same API URL before creating a release APK.
