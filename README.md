<div align="center">

# GreenBond OS

**Blockchain-verified smart green bond monitoring platform**

[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Celery](https://img.shields.io/badge/Celery-5.4-37814A?style=flat-square&logo=celery&logoColor=white)](https://docs.celeryq.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![Polygon](https://img.shields.io/badge/Polygon-Amoy_Testnet-8247E5?style=flat-square&logo=polygon&logoColor=white)](https://polygon.technology)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

*Automated PR calculation · Penalty enforcement · Immutable blockchain audit trails · Live NASA satellite data*

</div>

---

## Overview

GreenBond OS automates the full compliance lifecycle of a green bond. Every day at **06:00 IST**, the system:

1. Fetches satellite irradiance data from the **NASA POWER API** for each bond's GPS coordinates
2. Compares it against inverter production logs submitted via the UI or IoT push
3. Calculates a **Performance Ratio (PR)** using industry-standard formulas
4. Detects underperformance streaks and — upon crossing the 3-day threshold — **executes a rate change on the Polygon blockchain**
5. Dispatches **SMS and email alerts** to the bond issuer
6. Surfaces everything through a live React dashboard with full Glass Box audit transparency

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Vite)                     │
│  Dashboard · Bond Detail · Glass Box · Alert Center · Data Entry│
│  Bond Registration · Blockchain Explorer · System Health        │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP /api/*
┌────────────────────────────▼────────────────────────────────────┐
│                    FASTAPI (uvicorn) :8000                      │
│  bonds · audit · production · alerts · blockchain · health      │
│  CORS middleware · structured logging · Sentry error capture    │
│  Lifespan hook: table creation + startup catchup on every boot  │
└──────┬──────────────────────────────────────┬───────────────────┘
       │ SQLAlchemy ORM                       │ redis-py
┌──────▼──────────┐                  ┌────────▼────────┐
│   PostgreSQL    │                  │      Redis      │
│  bonds          │                  │  Celery broker  │
│  audit_logs     │                  │  API cache      │
│  production_    │                  │  NASA GHI cache │
│  entries        │                  └────────┬────────┘
│  alerts         │                           │ task queue
└──────┬──────────┘              ┌────────────▼────────────────┐
       │                         │        CELERY WORKER        │
       │                         │  daily_audit pipeline       │
       │                         │  bond maturity checker      │
       │                         │  startup catchup recovery   │
       │                         └────────────┬────────────────┘
       │                                      │
       │              ┌───────────────────────┼──────────────────┐
       │              │                       │                  │
       │   ┌──────────▼──────┐  ┌─────────────▼──────┐  ┌────────▼──────┐
       │   │  NASA POWER API │  │ Polygon Smart      │  │ SendGrid /    │
       │   │  (free, no key) │  │ Contract           │  │ Twilio SMS    │
       └───│  GHI kWh/m²     │  │ recordRateChange() │  │ alert alerts  │
           └─────────────────┘  └────────────────────┘  └───────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| API server | FastAPI 0.111 + Uvicorn | REST endpoints, async I/O |
| ORM | SQLAlchemy 2.0 | Database models, session management |
| Database | PostgreSQL 15 | Bonds, audits, production entries, alerts |
| Task queue | Celery 5.4 | Async background audit execution with retries |
| Scheduler | Celery Beat | Cron-based 06:00 IST daily trigger |
| Cache + broker | Redis 7 | NASA GHI cache, API response cache, Celery broker |
| Blockchain | Web3.py 7 | Rate change writes to Polygon smart contract |
| Satellite data | NASA POWER API | Free global GHI irradiance — no API key required |
| Email | SendGrid | Penalty and recovery alert emails |
| SMS | Twilio | Critical escalation alerts |
| Error monitoring | Sentry SDK | Unhandled exceptions, slow transaction traces |
| Config | Pydantic Settings | Type-safe `.env` management |
| Frontend | React 18 + Vite + Recharts | Dashboard, charts, bond detail views |

---

## Quick Start

**Prerequisites:** Python 3.13, Node.js 18+, PostgreSQL 15, Redis 7

---

### 1. PostgreSQL Setup

**macOS**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**Windows**
Download and run the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows). During setup, set a password for the `postgres` superuser and leave the default port as `5432`.

**Create the database and user** (all platforms):
```bash
psql -U postgres -c "CREATE USER greenbond WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE greenbonds OWNER greenbond;"
```

> The `DATABASE_URL` in `.env` should be `postgresql://greenbond:password@localhost:5432/greenbonds`. Tables are created automatically on first server startup — no migrations needed.

---

### 2. Redis Setup

**macOS**
```bash
brew install redis
brew services start redis
```

**Ubuntu / Debian**
```bash
sudo apt update
sudo apt install -y redis-server
sudo systemctl start redis
sudo systemctl enable redis
```

**Windows**
Redis does not have an official Windows build. Use one of:
- **WSL2** — install Redis inside a Ubuntu WSL2 instance using the Linux steps above
- **Docker** — `docker run -d -p 6379:6379 redis:7`

**Verify Redis is running:**
```bash
redis-cli ping   # should return: PONG
```

> The `REDIS_URL` in `.env` should be `redis://localhost:6379/0`.

---

### 3. Application Setup

```bash
# Clone the repo
git clone https://github.com/Ramya07-cs/greenbond-os.git
cd greenbond-os

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate.bat
pip install -r requirements.txt
cp .env.example .env              # Fill in your credentials

# Frontend
cd ../frontend && npm install
```

### 4. Database Migration

If you are upgrading from a previous version, run the one-time migration before starting the server. This adds blockchain registration columns to the `bonds` table and `gas_used` to `audit_logs`. Safe to run on a populated database — uses `IF NOT EXISTS`.

```bash
cd backend
source venv/bin/activate
python migrate_add_registration.py
```

> **First-time setup:** Skip this step — the lifespan hook creates all tables automatically on first boot.

### 5. Run All Services

Run all four processes in separate terminals:

```bash
# Terminal 1 — FastAPI server
cd backend && source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Celery worker (processes audit tasks)
cd backend && source venv/bin/activate
celery -A tasks.celery_app worker --loglevel=info --pool=solo -Q audits,default,celery

# Terminal 3 — Celery Beat (fires 06:00 IST daily)
cd backend && source venv/bin/activate
celery -A tasks.celery_app beat --loglevel=info

# Terminal 4 — React frontend
cd frontend && npm run dev
```

| URL | Description |
|---|---|
| http://localhost:5173 | Live dashboard |
| http://localhost:8000/api/health/ | System health check |

---

## Blockchain Bond Registration

Every bond must be registered on the Polygon smart contract **once** before penalty events can be written on-chain. Without this step, penalty transactions will revert with `"bond not registered"` — the rate change still saves to PostgreSQL but without a TX hash.

### Register via the UI

Go to **Blockchain Explorer → Register Bonds**. Each bond card shows a green **✓ REGISTERED** badge if already registered. For unregistered bonds, click **Register On-Chain** — the TX hash and block number are stored in the database and persist across page reloads.

### Registration state is DB-backed

`bonds.registered_on_chain`, `bonds.registration_tx_hash`, and `bonds.registration_block` are stored in PostgreSQL after every successful registration call. The UI reads these fields from the API — no ephemeral frontend state.

### Backfilling pre-existing registrations

If bonds were registered via the old curl workflow before registration persistence was added, use the backfill form that appears on each registered-but-no-hash card in the Register Bonds tab. Paste the TX hash and block number from [amoy.polygonscan.com](https://amoy.polygonscan.com) and click **Save**.

---

## Frontend Views

| View | Description |
|---|---|
| **Dashboard** | Portfolio KPIs, compliance rate, bond table with live PR and rates |
| **Bond Detail** | Per-bond analytics, PR/energy/interest charts, streak tracker, audit log |
| **Glass Box** | Full audit transparency — NASA GHI, PR formula, verdict reasoning |
| **Blockchain tab** | Bond registration TX + all rate-change TXes (penalty/recovery) per bond, each with block, gas, and Polygonscan link |
| **Data Entry** | Manual daily kWh submission with monthly coverage calendar |
| **IoT Auto-Sync** | Form-based IoT push with live payload preview and bond endpoint reference |
| **Bond Registration** | Full bond registration form with live JSON preview |
| **Blockchain Explorer** | Network status, on-chain bond registration, manual audit trigger with live PR snapshot |
| **Alert Center** | Full alert history with severity/type/bond filters, duplicate system alert collapsing, and Polygonscan TX links |
| **System Health** | Live status for PostgreSQL, Redis, Celery, Polygon, and NASA API |

---

## The Daily Audit Pipeline

Each active bond runs through this 8-step pipeline every morning at 06:00 IST.

### Step 1 — NASA GHI Fetch

Queries the NASA POWER API (`ALLSKY_SFC_SW_DWN`, `RE` community) for the bond's GPS coordinates. Returns Global Horizontal Irradiance in kWh/m².

**Redis caching:** Results are stored under `nasa:ghi:{bond_id}:{YYYYMMDD}` with a 24h TTL. Historical GHI never changes, so cache hits are permanent for past dates.

**NASA data lag:** NASA's satellite compositing introduces a 5–6 day lag. When production data exists but GHI is not yet available, the audit produces an `IGNORED` verdict and is retried automatically by the catchup system.

### Step 2 — Production Data Retrieval

Reads the inverter kWh figure submitted manually via the Data Entry UI or automatically via `POST /api/production/iot`.

If no entry exists for a date, a missing data alert is dispatched — on day 1 via email, then every 3rd consecutive missing day via SMS. Missing days are **neutral** and do not advance or reset the penalty streak.

### Step 3 — Performance Ratio Calculation

```
expected_kwh = NASA_GHI × capacity_kW × performance_factor (0.80)
actual_ghi   = actual_kwh ÷ (capacity_kW × performance_factor)
PR           = actual_ghi ÷ NASA_GHI
```

The performance factor of **0.80** accounts for inverter efficiency, wiring resistance, soiling, temperature derating, and mismatch losses.

**Manipulation detection:** A PR above 1.0 is physically impossible. Any submission yielding PR > 1.0 is automatically flagged as `PENALTY` — treating it as `IGNORED` would allow fraudulent submissions to silently bypass compliance.

| Condition | Verdict |
|---|---|
| `PR ≥ 0.75` | `COMPLIANT` |
| `PR < 0.75` | `PENALTY` |
| `PR > 1.0` | `PENALTY` — data manipulation flag |
| No production data or no NASA GHI | `IGNORED` |

### Step 4 — Penalty and Recovery Evaluation

```
Penalty trigger:  3 consecutive PENALTY days   → rate = base_rate × 1.5
Recovery trigger: 7 consecutive COMPLIANT days  → rate = base_rate
IGNORED days:     neither streak changes
```

Both thresholds and the multiplier are configurable via `.env`.

### Step 5 — Blockchain Write

If a rate change was triggered, `blockchain_service.write_rate_change()` calls `recordRateChange()` on the deployed Polygon smart contract. The payload includes bond ID, previous rate, new rate, trigger type, and a full PR snapshot. The **transaction hash, block number, and gas used** are stored in `audit_logs`, creating a permanent cryptographic link between the database record and the on-chain event.

**Lazy initialisation:** Web3 connects only on the first write call. A misconfigured `.env` disables blockchain writes only — all API routes, the audit pipeline, and the frontend continue to function normally.

### Step 6 — Alert Dispatch

Rate change events trigger email (SendGrid) and SMS (Twilio) to the bond issuer, plus a `critical` severity alert record in the `alerts` table visible in the Alert Center. Recovery events produce a `success` severity alert. Missing data alerts are rate-limited to prevent quota exhaustion during multi-day gaps.

### Step 7 — Audit Log Upsert

Each audit record is an **upsert** against `(bond_id, date)`. Re-running the audit for the same bond and date overwrites the existing row rather than appending a duplicate — making manual re-runs, catchup, and the Beat scheduler all safe to call simultaneously.

The idempotency guard recognises `COMPLIANT`, `PENALTY`, and `RECOVERY` verdicts — a fixed bug from the original implementation that could silently corrupt recovery records on re-run.

### Step 8 — Cache Invalidation

Purges Redis keys for the affected bond after every write:

```
bond:detail:{bond_id}
bond:pr_today:{bond_id}
bond:timeseries:{bond_id}:*
bonds:list
dashboard:summary
health:full_check
```

---

## Catchup System

On every server startup, `catchup_missed_audits()` runs automatically via the FastAPI lifespan hook. It identifies every calendar day with no audit record for each active bond and queues Celery tasks staggered 10 seconds apart to avoid NASA API rate limits.

| Behaviour | Detail |
|---|---|
| **Registration floor** | Never audits before a bond's `created_at` timestamp |
| **Idempotency** | Checks existing records before queuing — safe to restart repeatedly |
| **Safety cap** | 30-day maximum lookback prevents runaway task queues |
| **NASA lag awareness** | Dates within the 5–6 day lag window produce `IGNORED` and are retried on next startup |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bonds/` | All bonds with live PR, streak stats, and registration status |
| `POST` | `/api/bonds/` | Register a new bond |
| `GET` | `/api/bonds/{id}` | Single bond detail |
| `GET` | `/api/bonds/{id}/timeseries` | PR + energy + rate chart data |
| `GET` | `/api/bonds/dashboard/summary` | Aggregated KPIs for the dashboard |
| `POST` | `/api/production/manual` | Submit daily kWh manually |
| `POST` | `/api/production/iot` | IoT inverter push endpoint |
| `POST` | `/api/audit/run` | Trigger a manual audit for a date |
| `POST` | `/api/audit/catchup` | Run catchup for all missed dates |
| `GET` | `/api/audit/` | Paginated audit log with filters |
| `GET` | `/api/alerts/` | Alert history filtered by bond, type, severity |
| `GET` | `/api/alerts/summary` | Unread count and severity breakdown |
| `GET` | `/api/blockchain/status` | Live Polygon node, contract address, and connection status |
| `POST` | `/api/blockchain/register/{bond_id}` | Register a bond on the smart contract — persists TX hash to DB |
| `PATCH` | `/api/blockchain/register/{bond_id}/tx` | Backfill registration TX hash for pre-existing registrations |
| `GET` | `/api/health/` | Full system health across all services |

> **Note on manual audits:** Always target a date at least 6 days in the past. NASA data for recent dates is not yet composited — auditing them produces `IGNORED` verdicts with no log written.

---

## Data Models

### `bonds`
| Column | Type | Description |
|---|---|---|
| `id` | VARCHAR | Bond identifier e.g. `GB-2025-001` |
| `capacity_kw` | NUMERIC | System capacity in kilowatts |
| `lat` / `lng` | NUMERIC | GPS coordinates for NASA API |
| `base_rate` | NUMERIC | Contractual base interest rate |
| `current_rate` | NUMERIC | Live rate — may differ if penalised |
| `status` | VARCHAR | `ACTIVE` / `PENALTY` / `MATURED` |
| `registered_on_chain` | BOOLEAN | True once registered on the smart contract |
| `registration_tx_hash` | VARCHAR | TX hash of the `registerBond()` call |
| `registration_block` | BIGINT | Polygon block number of registration |
| `created_at` | TIMESTAMPTZ | Registration timestamp — catchup floor |

### `audit_logs`
| Column | Type | Description |
|---|---|---|
| `date` | DATE | Audit date — unique per bond |
| `nasa_ghi` | NUMERIC | Satellite irradiance kWh/m² |
| `actual_kwh` | NUMERIC | Inverter production |
| `expected_kwh` | NUMERIC | NASA-derived expected output |
| `calculated_pr` | NUMERIC | Performance Ratio 0–1.0, NULL if IGNORED |
| `verdict` | VARCHAR | `COMPLIANT` / `PENALTY` / `RECOVERY` / `IGNORED` |
| `consecutive_penalty` | INT | Streak count at audit time |
| `rate_before` / `rate_after` | NUMERIC | Rate snapshot at audit time |
| `blockchain_tx_hash` | VARCHAR | On-chain proof — NULL if no rate change |
| `block_number` | INT | Polygon block number |
| `gas_used` | INT | Gas consumed by the blockchain TX |

---

## Alert Center

The Alert Center supports filtering by **severity** (critical / warning / success), **type** (BLOCKCHAIN / SYSTEM / EMAIL / SMS), and **bond ID**. Duplicate system alerts — such as repeated missing-data warnings for the same bond — are collapsed into a single row with a **×N** count badge via a toggle. Each blockchain alert includes a clickable Polygonscan link.

| Severity | When triggered |
|---|---|
| `critical` | PENALTY_TRIGGER — rate hike written to blockchain |
| `success` | RECOVERY_TRIGGER — rate restored to base |
| `warning` | Missing production data for a bond |
| `info` | General system events |

---

## What Frontend Numbers Represent

| UI Element | Backend Source |
|---|---|
| Latest PR % | `audit_logs.calculated_pr` — most recent non-IGNORED record |
| Penalty / Active badge | `bonds.status` — set by penalty engine after 3-day streak |
| Current Rate % | `bonds.current_rate` — updated atomically on blockchain write |
| PR / Energy / Interest charts | `timeseries` endpoint — `audit_logs` ordered by date |
| Streak bars | `audit_logs.consecutive_penalty / consecutive_compliant` |
| Financial Impact calculator | `tvl × (current_rate − base_rate) ÷ 100 ÷ 365` |
| Alert Center entries | `alerts` table — one row per email / SMS / blockchain event |
| Bond Registration badge | `bonds.registered_on_chain` — DB-backed, persistent across reloads |
| Registration TX in Blockchain tab | `bonds.registration_tx_hash` + `bonds.registration_block` |
| Rate-change TXes in Blockchain tab | `audit_logs.blockchain_tx_hash` — all records with a TX hash |
| Gas Used | `audit_logs.gas_used` — stored on every blockchain write |
| Production vs NASA chart | `actual_kwh` vs `expected_kwh` from `audit_logs` per day |
| Compliance Rate % | `COUNT(ACTIVE) ÷ COUNT(all non-MATURED bonds)` |
| System Health service dots | `/api/health/` — live ping against every external service |

---

## Configuration

Copy `backend/.env.example` to `backend/.env`. All PR thresholds are configurable without touching code:

```bash
# Database
DATABASE_URL=postgresql://greenbond:password@localhost:5432/greenbonds

# Redis
REDIS_URL=redis://localhost:6379/0

# Blockchain
POLYGON_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
WALLET_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT

# PR Engine
PR_THRESHOLD=0.75              # Minimum acceptable Performance Ratio
CONSECUTIVE_PENALTY_DAYS=3    # Under-threshold days before rate hike
CONSECUTIVE_RECOVERY_DAYS=7   # Above-threshold days to restore base rate
PERFORMANCE_FACTOR=0.80        # System loss factor (industry range 0.75–0.85)
PENALTY_RATE_MULTIPLIER=1.5   # Rate hike multiplier (1.5 = +50% above base)

# Notifications
SENDGRID_API_KEY=SG.xxxx
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx

# Error monitoring (optional)
SENTRY_DSN=https://xxxx@sentry.io/xxxx
```

---

## Project Structure

```
greenbond-os/
├── backend/
│   ├── main.py                   # FastAPI app, lifespan hook, catchup trigger
│   ├── config.py                 # Pydantic Settings — all config from .env
│   ├── database.py               # SQLAlchemy engine + session factory
│   ├── redis_client.py           # Shared Redis connection
│   ├── migrate_add_registration.py  # One-time migration for v2 schema additions
│   ├── models/
│   │   ├── bond.py               # registered_on_chain, registration_tx_hash, registration_block
│   │   ├── audit_log.py          # gas_used column added
│   │   ├── production_entry.py
│   │   └── alert.py
│   ├── routers/
│   │   ├── bonds.py              # BondOut exposes registration fields
│   │   ├── audit.py
│   │   ├── production.py
│   │   ├── alerts.py
│   │   ├── blockchain.py         # register + backfill TX endpoints, persists to DB
│   │   └── health.py
│   ├── services/
│   │   ├── pr_engine.py          # PR calculator + manipulation detection
│   │   ├── penalty_engine.py     # Streak-based rate change evaluator
│   │   ├── nasa.py               # NASA POWER API client + Redis cache
│   │   ├── blockchain.py         # Web3 writer; get_transaction uses read-only RPC
│   │   ├── alerts.py             # SendGrid + Twilio dispatcher + rate limiter
│   │   └── audit.py              # Upsert + streak reader; RECOVERY in idempotency guard
│   ├── tasks/
│   │   ├── celery_app.py         # Celery app factory + Beat schedule
│   │   ├── daily_audit.py        # 8-step audit pipeline; gas_used written to audit_log
│   │   ├── catchup.py            # Startup missed-audit recovery
│   │   └── maturity.py           # Bond maturity date checker
│   ├── contracts/abi.json        # Polygon smart contract ABI
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── views/
│       │   ├── Dashboard.jsx
│       │   ├── BondDetail.jsx        # Blockchain tab: registration TX + all rate-change TXes
│       │   ├── DataEntry.jsx
│       │   ├── BondRegistration.jsx
│       │   ├── BlockchainExplorer.jsx  # Register Bonds: DB-backed state, backfill form, PR refresh
│       │   ├── Alerts.jsx            # Rewritten: filters, dedup toggle, severity stripes
│       │   └── SystemHealth.jsx
│       ├── components/
│       │   ├── BlockchainModal.jsx
│       │   ├── GlassBox.jsx
│       │   ├── StreakTracker.jsx
│       │   ├── StatusBadge.jsx
│       │   ├── Sidebar.jsx
│       │   └── Topbar.jsx
│       ├── hooks/
│       │   └── useBonds.js
│       └── api.js                    # setRegistrationTx() added
├── .gitignore
├── LICENSE
└── README.md
```

## License

[MIT](LICENSE)

---

<div align="center">
<i>GreenBond OS — turning satellite data and blockchain proof into bond compliance.</i>
</div>
