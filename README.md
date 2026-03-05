<div align="center">

#  GreenBond OS

**Blockchain-verified smart green bond monitoring platform**

[![Python](https://img.shields.io/badge/Python-3.13-3776AB?style=flat-square&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-009688?style=flat-square&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![Celery](https://img.shields.io/badge/Celery-5.4-37814A?style=flat-square&logo=celery&logoColor=white)](https://docs.celeryq.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?style=flat-square&logo=postgresql&logoColor=white)](https://postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=flat-square&logo=redis&logoColor=white)](https://redis.io)
[![Polygon](https://img.shields.io/badge/Polygon-Amoy_Testnet-8247E5?style=flat-square&logo=polygon&logoColor=white)](https://polygon.technology)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

*Automated PR calculation · Penalty enforcement · Immutable audit trails · Live satellite data*

</div>

---

## What This System Does

GreenBond OS automates the entire compliance lifecycle of a green bond. Every day at **06:00 IST**, the system:

1. Fetches satellite irradiance data from the **NASA POWER API** for each bond's GPS coordinates
2. Compares it against inverter production logs submitted via the UI or IoT push
3. Calculates a **Performance Ratio (PR)** using industry-standard formulas
4. Detects underperformance streaks and — if the bond crosses the 3-day threshold — **executes a rate change on the Polygon blockchain**
5. Dispatches **SMS and email alerts** to the issuer and investors
6. Exposes everything through a live React dashboard with Glass Box audit transparency

What the frontend shows as a percentage and a coloured badge is the output of a multi-stage pipeline that crosses four external systems, two databases, a message queue, and a smart contract.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (React + Vite)                     │
│   Dashboard · Bond Detail · Glass Box · Alert Center · Map      │
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
       └───┘  GHI kWh/m² ←   │  │ recordRateChange() │  │ alert alerts  │
           └───────────────┘    └────────────────────┘  └───────────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| API server | FastAPI 0.111 + Uvicorn | REST endpoints, Swagger UI, async I/O |
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

```bash
# 1. Clone the repo
git clone https://github.com/yourname/greenbond-os.git
cd greenbond-os

# 2. Backend setup
cd backend
python3 -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate.bat
pip install -r requirements.txt
cp .env.example .env              # Fill in your credentials

# 3. Create the database
psql -U postgres -c "CREATE USER greenbond WITH PASSWORD 'password';"
psql -U postgres -c "CREATE DATABASE greenbonds OWNER greenbond;"

# 4. Frontend setup
cd ../frontend && npm install
```

Open **4 terminals** and run each process:

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

| URL | What it is |
|---|---|
| http://localhost:5173 | Live dashboard |
| http://localhost:8000/docs | Swagger API docs |
| http://localhost:8000/api/health/ | System health check |

---

## The Daily Audit Pipeline

Each active bond runs through this 8-step pipeline every morning at 06:00 IST via Celery Beat.

### Step 1 — NASA GHI Fetch

```python
nasa_service.get_ghi(lat, lng, target_date, bond_id)
```

Queries the NASA POWER API (`ALLSKY_SFC_SW_DWN` parameter, `RE` community) for the bond's GPS coordinates. Returns Global Horizontal Irradiance in kWh/m².

**Redis caching:** Each result is stored under `nasa:ghi:{bond_id}:{YYYYMMDD}` with a 24h TTL. Historical GHI never changes, so cache hits are permanent for past dates.

**NASA data lag:** NASA's satellite compositing introduces a 5–6 day lag. When user production data exists but GHI is not yet available, the audit skips silently — no log is written, and the date is retried automatically by the catchup system once satellite data arrives.

### Step 2 — Production Data Retrieval

```sql
SELECT kwh FROM production_entries
WHERE bond_id = :bond_id AND date = :audit_date
```

Reads the inverter kWh figure submitted manually via the Data Entry UI or automatically via `POST /api/production/iot` by the inverter's push integration.

If no entry exists for that date: a missing data alert is dispatched (email on day 1, SMS escalation every 3rd consecutive missing day). Missing days are **neutral** — they do not advance or reset the penalty streak.

### Step 3 — Performance Ratio Calculation

```
expected_kwh = NASA_GHI × capacity_kW × performance_factor
actual_ghi   = actual_kwh ÷ (capacity_kW × performance_factor)
PR           = actual_ghi ÷ NASA_GHI
```

The **performance factor of 0.80** accounts for real-world system losses: inverter efficiency, wiring resistance, soiling, temperature derating, and mismatch losses. Industry standard range is 0.75–0.85.

**Manipulation detection:** A PR above 1.0 is physically impossible — a solar panel cannot produce more energy than the irradiance the sun delivered. Any kWh submission yielding PR > 1.0 is automatically flagged as `PENALTY` with reason `"submitted kWh physically impossible"`. Treating it as `IGNORED` would silently allow fraudulent submissions to avoid penalty.

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

Both thresholds and the multiplier are fully configurable via `.env` — no code changes required.

### Step 5 — Blockchain Write

If a rate change was triggered, `blockchain_service.write_rate_change()` calls `recordRateChange()` on the deployed Polygon smart contract. The payload includes bond ID, previous rate, new rate, trigger type, and a full PR snapshot. The **transaction hash and block number** are stored in `audit_logs`, creating a permanent cryptographic link between the database record and the on-chain event.

**Lazy initialisation:** Web3 connects only on the first write call, not at import time. A misconfigured private key in `.env` disables blockchain writes only — all API routes, audit pipeline, and frontend continue to function normally.

### Step 6 — Alert Dispatch

Rate change events trigger:
- **Email** (SendGrid) to the bond issuer and registered investors
- **SMS** (Twilio) to the issuer's phone number
- **Alert record** inserted into the `alerts` table (visible in the frontend Alert Center)

Missing data alerts are rate-limited: sent on day 1 of a gap, then every 3rd consecutive day — prevents email quota exhaustion during multi-day outages or long catchup runs.

### Step 7 — Audit Log Upsert

Each audit record is an **upsert** against `(bond_id, date)`. Re-running the audit for the same bond+date overwrites the existing row rather than appending a duplicate. This makes manual re-runs, catchup, and the Beat scheduler all safe to call simultaneously — one record per bond per day, always.

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

The frontend receives fresh data on the next API call without waiting for TTL expiry.

---

## Catchup System

On every server startup, `catchup_missed_audits()` runs automatically via the FastAPI lifespan hook. It identifies every calendar day with no audit record for each active bond, and queues Celery tasks for each — staggered 10 seconds apart to avoid rate-limiting the NASA API.

| Behaviour | Detail |
|---|---|
| **Registration floor** | Never audits before a bond's `created_at` timestamp |
| **Idempotency** | Checks existing records before queuing — safe to restart many times |
| **Safety cap** | 30-day maximum lookback prevents runaway task queues |
| **NASA lag awareness** | Dates within the 5–6 day lag window will return IGNORED and be retried on the next startup |

---

## Triggering a Manual Audit

The pipeline fires automatically at 06:00 IST. To audit a specific date manually:

```bash
curl -X POST "http://localhost:8000/api/audit/run?target_date=2026-02-27&bond_id=GB-2025-001"
```

> **Note:** Always audit a date at least 6 days in the past. NASA data for recent dates is not yet available — auditing them will produce IGNORED verdicts and write no log record.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bonds/` | All bonds with live PR and streak stats |
| `POST` | `/api/bonds/` | Register a new bond |
| `GET` | `/api/bonds/{id}` | Single bond detail |
| `GET` | `/api/bonds/{id}/timeseries` | PR + energy + rate chart data (60 days) |
| `GET` | `/api/bonds/dashboard/summary` | Aggregated KPIs for the dashboard |
| `POST` | `/api/production/manual` | Submit daily kWh manually |
| `POST` | `/api/production/iot` | IoT inverter push endpoint |
| `POST` | `/api/audit/run` | Trigger a manual audit for a date |
| `GET` | `/api/audit/` | Paginated audit log with filters |
| `GET` | `/api/alerts/` | Alert history by bond, type, severity |
| `GET` | `/api/alerts/summary` | Unread count + severity breakdown |
| `GET` | `/api/blockchain/status` | Live Polygon node + contract status |
| `GET` | `/api/health/` | Full system health (all services) |

Full interactive docs: `http://localhost:8000/docs`

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
| `created_at` | TIMESTAMPTZ | Registration timestamp — catchup floor |

### `audit_logs`
| Column | Type | Description |
|---|---|---|
| `date` | DATE | Audit date — unique per bond |
| `nasa_ghi` | NUMERIC | Satellite irradiance kWh/m² |
| `actual_kwh` | NUMERIC | Inverter production |
| `expected_kwh` | NUMERIC | NASA-derived expected output |
| `calculated_pr` | NUMERIC | Performance Ratio 0–1.0, NULL if IGNORED |
| `verdict` | VARCHAR | `COMPLIANT` / `PENALTY` / `IGNORED` |
| `consecutive_penalty` | INT | Streak count at audit time |
| `rate_before` / `rate_after` | NUMERIC | Rate snapshot at audit time |
| `blockchain_tx_hash` | VARCHAR | On-chain proof — NULL if no rate change |
| `block_number` | INT | Polygon block number |

---

## What Frontend Numbers Actually Represent

| UI Element | Backend Source |
|---|---|
| Today's PR % | `audit_logs.calculated_pr` — latest non-IGNORED record for the bond |
| Penalty / Active badge | `bonds.status` — set by penalty engine after 3-day streak |
| Current Rate % | `bonds.current_rate` — updated atomically on blockchain write |
| 30-day PR chart | `timeseries` endpoint — `audit_logs` ordered by date |
| Streak bar | `audit_logs.consecutive_penalty / consecutive_compliant` |
| Financial Impact calculator | `tvl × (current_rate − base_rate) ÷ 100 ÷ 365` |
| Alert Center entries | `alerts` table — one row per email / SMS / blockchain event |
| TX Hash in Glass Box | `audit_logs.blockchain_tx_hash` — Polygon transaction ID |
| Production vs NASA chart | `actual_kwh` vs `expected_kwh` from `audit_logs` per day |
| Compliance Rate % | `COUNT(ACTIVE) ÷ COUNT(all non-MATURED bonds)` |
| System Health service dots | `/api/health/` — live ping against every external service |

---

## Configuration

Copy `backend/.env.example` to `backend/.env` and fill in your credentials. All PR thresholds are configurable without touching code:

```bash
PR_THRESHOLD=0.75              # Minimum acceptable Performance Ratio
CONSECUTIVE_PENALTY_DAYS=3    # Under-threshold days before rate hike
CONSECUTIVE_RECOVERY_DAYS=7   # Above-threshold days to restore base rate
PERFORMANCE_FACTOR=0.80        # System loss factor (industry range 0.75–0.85)
PENALTY_RATE_MULTIPLIER=1.5   # Rate hike multiplier (1.5 = +50% above base)
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
│   ├── models/                   # Bond, AuditLog, ProductionEntry, Alert
│   ├── routers/                  # bonds, audit, production, alerts, blockchain, health
│   ├── services/
│   │   ├── pr_engine.py          # PR calculator + manipulation detection
│   │   ├── penalty_engine.py     # Streak-based rate change evaluator
│   │   ├── nasa.py               # NASA POWER API client + Redis cache
│   │   ├── blockchain.py         # Web3 Polygon writer, lazy initialisation
│   │   ├── alerts.py             # SendGrid + Twilio dispatcher + rate limiter
│   │   └── audit.py              # Audit log upsert + streak reader
│   ├── tasks/
│   │   ├── celery_app.py         # Celery app factory + Beat schedule
│   │   ├── daily_audit.py        # 8-step audit pipeline
│   │   ├── catchup.py            # Startup missed-audit recovery
│   │   └── maturity.py           # Bond maturity date checker
│   ├── contracts/abi.json        # Polygon smart contract ABI
│   ├── .env.example              # Safe credential template
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── views/                # Dashboard, BondDetail, DataEntry, Alerts, etc.
│       ├── components/           # StatusBadge, GlassBox, StreakTracker, Topbar
│       ├── hooks/                # useBonds, useTimeseries
│       └── api.js                # Axios API client
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
