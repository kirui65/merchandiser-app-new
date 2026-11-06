# Brandsphere

Brandsphere is a field-sales platform for teams that sell, sample, and audit products in stores. It includes a mobile app for field reps, a web dashboard for managers, and an Express/Firestore API shared by both.

The project is split into three apps:

- `mobile/` — Expo/React Native app for reps in the field
- `backend/` — Express API and Firestore services
- `admin-dashboard/` — React dashboard for managers and recruiters

## What it does

- Record sales, expenses, outlet visits, stock checks, and competitor prices
- Keep working when a rep is offline, then sync local changes when the connection returns
- Assign outlets and territories to reps
- Track planned routes and replay visits on a map
- Manage campaigns, leads, recruiters, and candidate referrals
- Reconcile M-Pesa collections with recorded sales
- Export operational reports as CSV or PDF

## Stack

- React Native and Expo
- React and Vite
- Node.js and Express
- Firebase Admin SDK and Firestore
- SQLite for the mobile offline queue
- JWT authentication
- M-Pesa Daraja API

## Running locally

Each app has its own dependencies and environment file.

### API

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

The API runs on `http://localhost:4000` by default. Add the JWT and Firebase settings to `backend/.env` before using authenticated routes.

### Manager dashboard

```bash
cd admin-dashboard
npm install
cp .env.example .env
npm run dev
```

The dashboard runs on `http://localhost:5173` by default. Set `VITE_API_URL` if the API is running somewhere else.

### Mobile app

```bash
cd mobile
npm install
cp .env.example .env
npx expo start
```

For a physical device, point `EXPO_PUBLIC_API_URL` at the machine's LAN address instead of `localhost`.

## Project notes

Sales and route updates are written to the device queue before they are sent to the API. This lets a rep continue working through poor connectivity and prevents a retry from creating a duplicate sale.

The backend is the source of truth for authentication and permissions. Firestore rules remain in the repository as an additional safeguard and as documentation of the data model.

Routes, Firestore indexes, and deployment configuration live in `firestore/`, `firebase.json`, and `DEPLOYMENT.md`.

## Configuration

The example environment files list the variables needed by each app. M-Pesa features also require the Daraja settings in `backend/.env`, including a callback token for production deployments.
