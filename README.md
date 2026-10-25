# Peacock Fashions

Standalone storefront + backend + catalog admin for Peacock Fashions.

This repo is independent of the Raaji Collections site:

- Frontend: `index.html` (home), `listing.html`, `pages/`
- Backend API: `backend/src/server.js`
- Secure catalog admin: `/admin` (`/admin-login` for first-time setup)
- Data: its own tables in the `peacock` Postgres schema
  (`catalog`, `orders`, `admin_settings`)

## Local development

```bash
cd backend
npm install
cp ../.env.example .env   # edit DATABASE_URL
node --watch src/server.js
```

Open http://localhost:3000. On first run, create the admin at
http://localhost:3000/admin-login.

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | health check |
| GET | `/api/catalog` | published catalog |
| POST | `/api/orders` | place an order |
| GET | `/api/orders/:orderNumber` | track an order |
| GET | `/api/admin/status` | whether an admin exists |
| POST | `/api/admin/setup` | first-time admin creation |
| POST | `/api/admin/login` / `/logout` | session auth |
| POST | `/api/admin/publish` | publish catalog (auth) |
| GET | `/api/admin/orders` | list orders (auth) |
| PATCH | `/api/admin/orders/:id` | update status/payment (auth) |
| POST | `/api/upload` | product image upload (auth) |

The storefront falls back to the bundled `js/peacock-data.js` catalog if the
backend is unavailable, and uses the published DB catalog when it is available.

## Deploy

See `DEPLOY.md`.
