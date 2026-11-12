# InfraSentinel

Cyber-physical security platform for transformer monitoring (University of Venda · CyberSecureTech Hackathon).

```
infrasentinel/
├── backend/    Express API + SQLite   (also serves the frontend)
│   ├── server.js  db.js  seed.js  security.js  audit.js  package.json
└── frontend/   Static pages
    ├── index.html (login) + dashboard / transformers / monitoring / threats /
    │   simulation / audit / incidents / reports / map / offline / settings .html
    ├── css/styles.css
    └── js/ (api.js, ui.js, one script per page)
```

## Run locally
```bash
cd backend
npm install
npm start          # http://localhost:8000
```
Demo logins: `admin@infrasentinel.local / Sentinel@2024`, `analyst@infrasentinel.local / Analyst@2024`.

## Host it (Render, Railway, etc.)
One service serves both the API and the pages, so there is nothing to configure in the frontend.

| Setting | Value |
|---|---|
| Root directory | `backend` (the repo must still contain the `frontend/` folder next to it) |
| Build command | `npm install` |
| Start command | `npm start` |
| Node version | 22.13 or newer (set `NODE_VERSION=22` if the platform asks) |

Optional environment variables
- `PORT` – set automatically by the host.
- `DATA_DIR` – folder for the SQLite file. Point it at a persistent disk (e.g. `/var/data`) or the database resets on each deploy (free tiers have an ephemeral disk; the demo data is re-seeded automatically).
- `FRONTEND_DIR` – only if your frontend lives somewhere unusual.

Health check URL: `/api/health`.

Hosting the frontend separately? Open it once with `?api=https://your-backend-url` and it remembers the address.
