# Deploy Peacock Fashions (standalone)

## 1. Create the GitHub repo

```bash
cd /home/mayur/peacock-fashions
git add .
git commit -m "Standalone Peacock Fashions store"
git remote add origin git@github.com:<owner>/peacock-fashions.git
git push -u origin main
```

## 2. Create the Render service

1. Render Dashboard → **New → Web Service** → connect the new repo.
2. Runtime: **Docker** (the `Dockerfile` is included). Plan: Starter.
3. Health check path: `/api/health`.
4. Environment:

   ```env
   NODE_ENV=production
   DB_SCHEMA=peacock
   AUTH_SECRET=<long random string>
   UPLOAD_DIR=/data
   DATABASE_URL=<Postgres internal connection string>
   ```

5. Add a **Disk**: name `peacock-uploads`, mount path `/data`, 1 GB.
6. Deploy.

The first boot creates schema `peacock` and its tables. If the old shared
database still has `public.peacock_catalog`, `public.peacock_orders` and
`public.peacock_admin_settings`, they are imported once automatically, so the
published catalog, orders and admin login survive the move.

## 3. Custom domain

1. Render service → **Settings → Custom Domains** → add
   `peacock.raajicollections.com`.
2. In your DNS provider add the CNAME record Render shows.
3. Wait for the certificate to become active.

## 4. First admin login

Open `https://peacock.raajicollections.com/admin-login`. If the old admin
settings were imported, sign in with the existing Peacock admin credentials.
Otherwise create a new admin on that screen.

## 5. Clean up

After the new site is verified, the Peacock routes/assets can be removed from the
Raaji repo. The old `public.peacock_*` tables can stay as a backup; the new site
only reads/writes the `peacock` schema.

## Local smoke test

```bash
curl -s https://peacock.raajicollections.com/api/health
curl -s https://peacock.raajicollections.com/api/catalog | head
```
