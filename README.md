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
       │              ┌───────────────────────┘
       │              │
       │   ┌──────────▼──────┐  ┌─────────────▼──────┐
       │   │  NASA POWER API │  │ Polygon Smart      │
       │   │  (free, no key) │  │ Contract           │
       └───│  GHI kWh/m²     │  │ recordRateChange() │
           └─────────────────┘  └────────────────────┘
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
| Error monitoring | Sentry SDK | Unhandled exceptions, slow transaction traces |
| Config | Pydantic Settings | Type-safe `.env` management |
| Frontend | React 18 + Vite + Recharts | Dashboard, charts, bond detail views |

---

## Quick Start

**Prerequisites:** Python 3.13, Node.js 18+, PostgreSQL 15, Redis 7

### 1. PostgreSQL Setup

<details>
<summary>macOS</summary>

```bash
brew install postgresql@15 && brew services start postgresql@15
```
</details>

<details>
<summary>Ubuntu / Debian</summary>

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
sudo systemctl start postgresql && sudo systemctl enable postgresql
```
</details>

<details>
<summary>Windows</summary>

Download the installer from [postgresql.org/download/windows](https://www.postgresql.org/download/windows). Set a password for the `postgres` superuser, leave the default port as `5432`.
</details>

**Create the database and user (all platforms):**
```bash
psql -U postgres -c "CREATE USER greenbond WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE greenbonds OWNER greenbond;"
```

> Tables are created automatically on first server startup — no migrations needed.

### 2. Redis Setup

<details>
<summary>macOS</summary>

```bash
brew install redis && brew services start redis
```
</details>

<details>
<summary>Ubuntu / Debian</summary>

```bash
sudo apt install -y redis-server && sudo systemctl start redis
```
</details>

<details>
<summary>Windows</summary>

Use WSL2 (Linux steps above) or Docker: `docker run -d -p 6379:6379 redis:7`
</details>

```bash
redis-cli ping   # should return: PONG
```

### 3. Application Setup

```bash
git clone https://github.com/Ramya07-cs/greenbond-os.git
cd greenbond-os

# Backend
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate.bat
pip install -r requirements.txt
cp .env.example .env            # Fill in your credentials

# Frontend
cd ../frontend && npm install
```

### 4. Run All Services

```bash
# Terminal 1 — FastAPI
cd backend && source venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2 — Celery worker
cd backend && source venv/bin/activate
celery -A tasks.celery_app worker --loglevel=info --pool=solo -Q audits,default,celery

# Terminal 3 — Celery Beat
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

## The Daily Audit Pipeline

Each active bond runs through this 8-step pipeline every morning at **06:00 IST**.

**Step 1 — NASA GHI Fetch:** Queries the NASA POWER API for the bond's GPS coordinates. Results are Redis-cached for 24h. A 5–6 day satellite compositing lag means recent dates produce `IGNORED` verdicts and are retried automatically.

**Step 2 — Production Data Retrieval:** Reads the inverter kWh submitted via UI or IoT push. Missing data triggers an in-app alert record in the Alert Center.

**Step 3 — PR Calculation:**
```
expected_kwh = NASA_GHI × capacity_kW × 0.80
PR           = (actual_kwh ÷ (capacity_kW × 0.80)) ÷ NASA_GHI
```
A PR above 1.0 is physically impossible and is automatically flagged as `PENALTY` (manipulation detection).

| Condition | Verdict |
|---|---|
| `PR ≥ 0.75` | `COMPLIANT` |
| `PR < 0.75` | `PENALTY` |
| `PR > 1.0` | `PENALTY` — data manipulation flag |
| No data / no GHI | `IGNORED` |

**Step 4 — Penalty & Recovery Evaluation:**
```
Penalty trigger:  3 consecutive PENALTY days  → rate = base_rate × 1.5
Recovery trigger: 5 consecutive COMPLIANT days → rate = base_rate
IGNORED days:     streak unchanged
```

**Step 5 — Blockchain Write:** Rate change events call `recordRateChange()` on the deployed Polygon smart contract. The TX hash, block number, and gas used are stored in `audit_logs`.

**Step 6 — Alert Dispatch:** Rate changes write a `critical` / `success` severity alert record to the Alert Center.

**Step 7 — Audit Log Upsert:** Each record is an upsert against `(bond_id, date)` — re-running the same audit is always safe.

**Step 8 — Cache Invalidation:** Purges all Redis keys for the affected bond after every write.

---

## Celery Beat Schedule (IST)

| Time | Task | Purpose |
|---|---|---|
| 06:00 AM | `daily_audit` | Audits yesterday for all active bonds |
| 06:30 AM | `check_bond_maturity` | Marks matured bonds, computes final stats |
| 07:00 AM | `retry_failed_blockchain_txs` | Retries TXs that failed due to gas spike or RPC hiccup |
| 02:00 PM | `retry_ignored_audits` | Retries IGNORED days once NASA GHI arrives |
| 02:30 PM | `lock_expired_ignored_as_penalty` | Locks days past the 7-day submission deadline as PENALTY |

On every server restart, catchup and blockchain retry both run synchronously before accepting requests.

---

## Submission Policy

| Timing | Result |
|---|---|
| Within 3 days | Accepted — no flag |
| Days 4–7 | Accepted, flagged `submitted_late` — amber badge in Audit Log |
| After 7 days | **Rejected (HTTP 403)** — auto-recorded as PENALTY at 14:30 |
| After maturity | **Rejected (HTTP 403)** — bond is closed |

---

## Blockchain Bond Registration

Every bond must be registered on the smart contract **once** before penalty events can be written on-chain. Go to **Blockchain Explorer → Register Bonds** and click **Register On-Chain**. The TX hash and block number are stored in PostgreSQL and persist across reloads.

If bonds were registered outside the UI, use the backfill form on each card to paste the TX hash from [amoy.polygonscan.com](https://amoy.polygonscan.com).

---

## Frontend Views

| View | Description |
|---|---|
| **Dashboard** | Portfolio KPIs, compliance rate, bond table with live PR and rates |
| **Bond Detail** | Per-bond analytics — PR/energy/interest charts, streak tracker, audit log |
| **Glass Box** | Full audit transparency — NASA GHI, PR formula, verdict reasoning, late/auto-penalty banners |
| **Data Entry** | Daily kWh submission with navigable monthly calendar, maturity-aware date cap |
| **Bond Registration** | Bond creation form with live JSON preview |
| **Blockchain Explorer** | Network status, on-chain registration, manual audit trigger |
| **Alert Center** | Full alert history with severity/type/bond filters and Polygonscan TX links |
| **System Health** | Live status for PostgreSQL, Redis, Celery, Polygon, and NASA API |

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bonds/` | All bonds with live PR, streak stats, registration status |
| `POST` | `/api/bonds/` | Register a new bond |
| `GET` | `/api/bonds/{id}` | Single bond detail |
| `GET` | `/api/bonds/{id}/timeseries` | PR + energy + rate chart data |
| `GET` | `/api/bonds/dashboard/summary` | Aggregated KPIs |
| `POST` | `/api/production/manual` | Submit daily kWh manually |
| `POST` | `/api/production/iot` | IoT inverter push |
| `POST` | `/api/audit/run` | Trigger a manual audit for a specific date |
| `POST` | `/api/audit/catchup` | Run catchup for all missed dates |
| `POST` | `/api/audit/lock-expired` | Manually trigger deadline lock |
| `POST` | `/api/audit/recompute-maturity` | Recompute final stats for a matured bond |
| `GET` | `/api/audit/` | Paginated audit log with filters |
| `GET` | `/api/alerts/` | Alert history |
| `GET` | `/api/blockchain/status` | Live Polygon node and contract status |
| `POST` | `/api/blockchain/register/{bond_id}` | Register bond on-chain |
| `POST` | `/api/blockchain/retry-pending` | Manually retry failed TXs |
| `PATCH` | `/api/blockchain/register/{bond_id}/tx` | Backfill registration TX hash |
| `GET` | `/api/health/` | Full system health |

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
| `gas_used` | INT | Gas consumed by the TX |

---

## Configuration

```bash
# Database
DATABASE_URL=postgresql://YOUR_DB_USER:YOUR_DB_PASSWORD@localhost:5432/YOUR_DB_NAME

# Redis
REDIS_URL=redis://localhost:6379/0

# App
SECRET_KEY=your-secret-key-here
DEBUG=false   # true = bypass NASA lag guard, retry all IGNORED days on restart

# Blockchain
POLYGON_RPC_URL=https://polygon-amoy.g.alchemy.com/v2/YOUR_KEY
WALLET_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT

# PR Engine (all configurable without touching code)
PR_THRESHOLD=0.75
CONSECUTIVE_PENALTY_DAYS=3
CONSECUTIVE_RECOVERY_DAYS=5
PERFORMANCE_FACTOR=0.80
PENALTY_RATE_MULTIPLIER=1.5


# Error monitoring (optional)
SENTRY_DSN=https://xxxx@sentry.io/xxxx
```

---

## Project Structure

```
greenbond-os/
├── backend/
│   ├── main.py                      # FastAPI app, lifespan hook, catchup + retry on startup
│   ├── config.py                    # Pydantic Settings
│   ├── database.py                  # SQLAlchemy engine + session factory
│   ├── redis_client.py              # Shared Redis connection
│   ├── migrate_add_registration.py  # One-time v2 schema migration
│   ├── models/
│   │   ├── bond.py
│   │   ├── audit_log.py
│   │   ├── production.py
│   │   └── alert.py
│   ├── routers/
│   │   ├── bonds.py
│   │   ├── audit.py
│   │   ├── production.py
│   │   ├── alerts.py
│   │   ├── blockchain.py
│   │   └── health.py
│   ├── services/
│   │   ├── pr_engine.py             # PR calculator + manipulation detection
│   │   ├── penalty_engine.py        # Streak-based rate change evaluator
│   │   ├── nasa.py                  # NASA POWER API client + Redis cache
│   │   ├── blockchain.py            # Web3 writer
│   │   ├── alerts.py                # In-app alert dispatcher
│   │   └── audit.py                 # Upsert + streak reader
│   ├── tasks/
│   │   ├── celery_app.py
│   │   ├── beat_schedule.py         # 5 scheduled tasks
│   │   ├── daily_audit.py           # 8-step audit pipeline
│   │   ├── catchup.py               # Missed-audit recovery
│   │   ├── maturity.py              # Bond maturity checker
│   │   └── blockchain_retry.py      # Auto-retry failed TXs
│   ├── contracts/abi.json
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── views/
│       │   ├── Dashboard.jsx
│       │   ├── BondDetail.jsx
│       │   ├── DataEntry.jsx
│       │   ├── BondRegistration.jsx
│       │   ├── BlockchainExplorer.jsx
│       │   ├── Alerts.jsx
│       │   └── SystemHealth.jsx
│       ├── components/
│       │   ├── GlassBox.jsx
│       │   ├── StreakTracker.jsx
│       │   ├── BlockchainModal.jsx
│       │   ├── StatusBadge.jsx
│       │   ├── Sidebar.jsx
│       │   └── Topbar.jsx
│       ├── hooks/useBonds.js
│       └── api.js
├── .gitignore
├── LICENSE
└── README.md
```

---

## License

[MIT](LICENSE)

---

<div align="center">
<i>GreenBond OS — turning satellite data and blockchain proof into bond compliance.</i>
</div>
