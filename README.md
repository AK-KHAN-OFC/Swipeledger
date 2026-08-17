# SwipeLedger

Professional transaction and customer management web application.

**Current status: Phase 1 — Foundation + Authentication**

---

## Architecture

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite 5 + React Router 6 + TanStack Query + Zustand + Tailwind CSS |
| Backend | Node.js 20 + Express 5 + Mongoose |
| Database | MongoDB Atlas |
| Hosting | Render (static site + web service) |

**Identity model:** Single-user-per-account. The `accounts` collection is both the workspace and the authenticated identity. No users collection. Multiple people may share one account's credentials across up to `deviceLimit` registered devices.

---

## Requirements

- Node.js 20+
- MongoDB 6+ (with replica set support for transactions — Atlas free tier qualifies)
- npm 10+

---

## Local Setup

### 1. Clone and install

```bash
git clone <repo-url>
cd swipeledger
npm install                   # root: Jest, Supertest, mongodb-memory-server, mongoose, uuid
npm install --prefix server   # backend: Express, Mongoose, bcrypt, etc.
npm install --prefix client   # frontend: React, Vite, Tailwind, etc.
```

> **Lockfiles must be committed.** The CI workflow uses `npm ci`, which requires
> `package-lock.json`, `server/package-lock.json`, and `client/package-lock.json`
> to exist in the repository. Running `npm install` above generates all three.
> Commit them before pushing:
>
> ```bash
> git add package-lock.json server/package-lock.json client/package-lock.json
> git commit -m "chore: add lockfiles for reproducible installs"
> git push
> ```
>
> Or use the convenience script: `npm run generate-lockfiles`

> **First-run note:** `mongodb-memory-server` downloads a real MongoDB 7.0.14 binary
> (~70 MB) on first test run. This requires internet access and may take a few minutes.
> The binary is cached in `~/.cache/mongodb-binaries/` and reused on subsequent runs.
> The version is pinned in `package.json` under `"mongodbMemoryServer"` so all
> contributors download the same binary.

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set:
- `MONGODB_URI` — your MongoDB Atlas connection string or local URI
- `JWT_SECRET` — generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- `SEED_PASSWORD` — password for the initial account

**Never commit `.env` to version control.**

### 3. Start MongoDB

For local development, MongoDB must be running as a replica set (required for transactions). The simplest option:

```bash
# Using Docker
docker run -d -p 27017:27017 --name mongo mongo:7 --replSet rs0
docker exec mongo mongosh --eval "rs.initiate()"
```

Or use MongoDB Atlas (recommended — free tier M0 supports replica sets and transactions).

### 4. Seed the database

```bash
npm run seed
```

This creates:
1. Free plan
2. Initial account (credentials printed to terminal)
3. Subscription
4. Settings

### 5. Run in development

```bash
npm run dev
# Backend: http://localhost:10000
# Frontend: http://localhost:5173
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` / `production` / `test` |
| `PORT` | No | Server port. Default: `10000` (Render assigns this automatically) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `JWT_SECRET` | Yes | ≥32 random chars. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_EXPIRY` | Yes | Access token lifetime e.g. `60m`, `2h` |
| `REFRESH_TOKEN_EXPIRY_DAYS` | Yes | Refresh token lifetime in days |
| `CLIENT_ORIGIN` | Yes | Frontend URL for CORS e.g. `http://localhost:5173` |
| `BCRYPT_ROUNDS` | Yes | bcrypt cost factor (12 for production, 4 for development speed) |
| `VITE_API_URL` | Yes (prod) | Backend API URL bundled into the frontend. Set to `https://your-api.onrender.com/api/v1` on Render. Leave as `/api/v1` for local dev (Vite proxy handles it). |
| `DEFAULT_DEVICE_LIMIT` | No | Default active device limit. Default: `3` |
| `LOG_LEVEL` | No | `error` / `warn` / `info` / `http`. Default: `http` |
| `SEED_BUSINESS_NAME` | No | Business name for seed account |
| `SEED_USERNAME` | No | Username for seed account |
| `SEED_PASSWORD` | No | Password for seed account (required to run seed script) |

---

## API Endpoints (Phase 1)

### Authentication (`/api/v1/auth`)
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | No | Login with accountCode + username + password |
| POST | `/logout` | Bearer | Revoke current session |
| POST | `/refresh` | Cookie | Rotate refresh token, return new access token |
| POST | `/logout-all` | Bearer | Revoke all other sessions |
| POST | `/change-password` | Bearer | Change password, revoke other sessions |

### Account (`/api/v1/account`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Bearer | Get account info + plan |
| PATCH | `/` | Bearer | Update businessName, mobileNumber |

### Devices (`/api/v1/devices`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Bearer | List active devices |
| DELETE | `/:id` | Bearer | Revoke a device |
| POST | `/logout-others` | Bearer | Revoke all other device sessions |

### Settings (`/api/v1/settings`)
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | Bearer | Get account preferences |
| PATCH | `/` | Bearer | Update preferences |

### Other
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/health` | No | Health check (used by Render) |
| GET | `/api/v1/audit` | Bearer | Audit log (Phase 4 — returns empty list) |

All requests to protected routes require:
- `Authorization: Bearer <accessToken>` header
- `X-Device-ID: <uuid-v4>` header

---

## Test Commands

```bash
# All tests
npm test

# Unit tests only
npm run test:unit

# Integration tests only (requires MongoDB replica set)
npm run test:integration

# Security tests
npm run test:security

# With coverage
npm run test:coverage
```

Tests use `mongodb-memory-server` with a single-node replica set — no external MongoDB needed for tests.

---

## Build (Frontend)

```bash
npm run build
# Output: client/dist/
```

---

## Render Deployment

### Backend (Web Service)
- **Build command:** `cd server && npm install`
- **Start command:** `cd server && node index.js`
- **Health check path:** `/health`
- Set all environment variables in Render's environment panel

### Frontend (Static Site)
- **Build command:** `cd client && npm install && npm run build`
- **Publish directory:** `client/dist`
- Set `VITE_API_URL` to your backend URL: `https://your-api.onrender.com/api/v1`
- Add a rewrite rule: `/* → /index.html` (for client-side routing)

---

## Security Notes

- Passwords are hashed with bcrypt (cost 12). Never stored plain.
- Refresh tokens are stored as SHA-256 hashes only. Raw token lives in httpOnly cookie.
- Access tokens live in memory only — never localStorage.
- Device UUID lives in a SameSite=Lax cookie (not httpOnly) as the primary store, with localStorage as fallback. This solves iOS PWA home-screen context isolation.
- All DB queries are scoped to `req.accountId` derived from the JWT — never from client input.
- Rate limiting: 10 IP failures / 15 min, 5 account failures / 15 min. Counts failures only.
- Device limit enforcement uses MongoDB transactions for atomicity.
- `app.set('trust proxy', 1)` is set for correct IP detection behind Render's proxy.
- NoSQL injection protection via express-mongo-sanitize.

---

## What Is Intentionally NOT Implemented (Phase 1)

- Customers, Transactions, Payment Accounts (Phase 2)
- Dashboard analytics (Phase 3)
- Full Audit Log display (Phase 4)
- PWA offline caching (Phase 5)
- Multi-user accounts — excluded by design (single-user-per-account model)
- Billing and subscription management
- SMS/OTP authentication

---

## Phase Roadmap

| Phase | Status | Description |
|---|---|---|
| 0 | ✅ Complete | Architecture & Audit (Blueprint v2.1) |
| 1 | ✅ Complete | Foundation + Authentication |
| 2 | Pending | Customers + Transactions |
| 3 | Pending | Dashboard + Reports |
| 4 | Pending | Devices + Account management display |
| 5 | Pending | PWA + Offline strategy |
| 6 | Pending | Security hardening |
| 7 | Pending | Testing + QA |
| 8 | Pending | Deployment |
