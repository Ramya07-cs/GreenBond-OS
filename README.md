# ⬡ GreenBond OS

**A blockchain-verified smart green bond monitoring platform.**  
Automated performance tracking, NASA-data-driven compliance scoring, penalty enforcement, and immutable on-chain audit trails — all in one operational system.

---

## Table of Contents

- [What Is This?](#what-is-this)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Core Concepts](#core-concepts)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Backend: FastAPI](#backend-fastapi)
- [Frontend: React](#frontend-react)
- [Blockchain Integration](#blockchain-integration)
- [NASA POWER API](#nasa-power-api)
- [Celery & Scheduling](#celery--scheduling)
- [Alert System](#alert-system)
- [Data Entry Modes](#data-entry-modes)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Deployment](#deployment)
- [Roadmap](#roadmap)

---

## What Is This?

GreenBond OS is a **Smart Green Bond monitoring system** that enforces energy performance agreements automatically and transparently.

A **Green Bond** is a financial instrument where the issuer borrows money at a preferential interest rate — on the condition that the funded renewable energy asset (solar farm, wind turbine, etc.) actually performs as promised.

**The Problem:**  
Traditional green bonds rely on manual audits and self-reported data. There is no enforcement mechanism. Issuers who underperform face no real consequence.

**The Solution:**  
GreenBond OS automates the entire lifecycle:

1. Every day, the system fetches **NASA satellite GHI data** for each bond's GPS location
2. It calculates a **Performance Ratio (PR)** by comparing actual energy production vs. NASA-predicted output
3. If PR drops below **75%** for **3 consecutive days**, the interest rate is automatically hiked (e.g., 5% → 7.5%)
4. This rate change is written to the **Polygon blockchain** — creating an immutable, tamper-proof audit trail
5. **SMS + Email alerts** are dispatched to all stakeholders instantly
6. Rate recovers only after **7 consecutive compliant days** — preventing gaming

Everything is logged to PostgreSQL and every critical event has a blockchain transaction hash that anyone can verify on Polygonscan.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                             │
│   React (Vite) · IBM Plex Mono · Recharts · Bloomberg UI   │
│   Dashboard · Bond Detail · Map · Alerts · Data Entry       │
└────────────────────────────┬────────────────────────────────┘
                             │ REST API
┌────────────────────────────▼────────────────────────────────┐
│                      FASTAPI BACKEND                        │
│   /bonds  /audit  /alerts  /data  /health  /blockchain      │
└──────┬─────────────┬──────────────┬──────────────┬──────────┘
       │             │              │              │
┌──────▼──────┐ ┌────▼─────┐ ┌─────▼──────┐ ┌───▼────────┐
│ PostgreSQL  │ │  Redis   │ │   Celery   │ │  Polygon   │
│  Audit Log  │ │  Cache   │ │  Workers   │ │ Blockchain │
│  Bond Data  │ │  Queue   │ │  + Beat    │ │  (Web3.py) │
└─────────────┘ └──────────┘ └────────────┘ └────────────┘
                                   │
                    ┌──────────────┼──────────────┐
                    │              │              │
             ┌──────▼─────┐ ┌─────▼──────┐ ┌────▼──────┐
             │ NASA POWER │ │  Twilio    │ │  SendGrid │
             │    API     │ │   (SMS)    │ │  (Email)  │
             └────────────┘ └────────────┘ └───────────┘
```

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend** | React 18 + Vite | UI framework |
| **Charts** | Recharts | PR, energy, interest rate graphs |
| **Styling** | Plain CSS + IBM Plex Mono + Barlow Condensed | Bloomberg terminal aesthetic |
| **Backend** | FastAPI (Python 3.11+) | REST API + business logic |
| **Database** | PostgreSQL 15 | Audit logs, bond data, production records |
| **Cache / Queue** | Redis 7 | Celery broker + result backend |
| **Task Queue** | Celery + Celery Beat | Scheduled daily audits |
| **Blockchain** | Web3.py + Polygon Mainnet | Immutable rate change records |
| **Smart Contract** | Solidity (ERC-compliant) | On-chain rate enforcement |
| **Satellite Data** | NASA POWER API | Daily GHI per GPS coordinate |
| **SMS** | Twilio | Penalty + recovery alerts |
| **Email** | SendGrid / SMTP | Stakeholder notifications |
| **Deployment** | Docker + Docker Compose | Container orchestration |

---

## Project Structure

```
greenbond-os/
│
├── backend/
│   ├── main.py                  # FastAPI entrypoint
│   ├── config.py                # Settings, env vars
│   ├── database.py              # SQLAlchemy setup
│   │
│   ├── models/
│   │   ├── bond.py              # Bond ORM model
│   │   ├── audit_log.py         # Daily PR audit record
│   │   ├── alert.py             # Alert log model
│   │   └── production.py        # Daily kWh entry model
│   │
│   ├── routers/
│   │   ├── bonds.py             # CRUD for bonds
│   │   ├── audit.py             # Audit log endpoints
│   │   ├── alerts.py            # Alert history
│   │   ├── production.py        # Manual + IoT data entry
│   │   ├── blockchain.py        # TX lookup + verification
│   │   └── health.py            # System health check
│   │
│   ├── services/
│   │   ├── nasa.py              # NASA POWER API client
│   │   ├── pr_engine.py         # PR calculation logic
│   │   ├── penalty_engine.py    # Streak + rate hike logic
│   │   ├── blockchain.py        # Web3.py Polygon client
│   │   ├── alerts.py            # Twilio + SendGrid
│   │   └── audit.py             # Audit record writer
│   │
│   ├── tasks/
│   │   ├── celery_app.py        # Celery app instance
│   │   ├── daily_audit.py       # Main scheduled task
│   │   └── beat_schedule.py     # Cron schedule (06:00 daily)
│   │
│   └── contracts/
│       ├── GreenBond.sol        # Solidity smart contract
│       └── abi.json             # Contract ABI for Web3.py
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx              # Shell + router
│   │   ├── views/
│   │   │   ├── Dashboard.jsx    # Global overview
│   │   │   ├── BondDetail.jsx   # Per-bond deep-dive
│   │   │   ├── MapView.jsx      # Portfolio map
│   │   │   ├── Alerts.jsx       # Alert center
│   │   │   ├── DataEntry.jsx    # Manual + IoT entry
│   │   │   └── SystemHealth.jsx # Admin health panel
│   │   ├── components/
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Topbar.jsx
│   │   │   ├── StatusBadge.jsx
│   │   │   ├── StreakTracker.jsx
│   │   │   ├── GlassBox.jsx     # Transparency accordion
│   │   │   └── BlockchainModal.jsx
│   │   └── hooks/
│   │       ├── useBonds.js
│   │       └── useTimeseries.js
│   ├── index.html
│   └── vite.config.js
│
├── docker-compose.yml
├── Dockerfile.backend
├── Dockerfile.frontend
├── .env.example
└── README.md
```

---

## Core Concepts

### Performance Ratio (PR)

The central metric of the entire system.

```
PR = Actual GHI (measured) ÷ NASA GHI (satellite baseline)
```

- **PR ≥ 0.75** → Compliant. No action.
- **PR < 0.75** → Below threshold. Streak counter increments.
- **PR < 0.75 for 3 consecutive days** → Penalty triggered. Rate hiked.
- **PR ≥ 0.75 for 7 consecutive days** → Recovery. Rate restored to base.

### Penalty & Recovery Logic

```python
# Simplified penalty engine
if consecutive_penalty_days >= 3 and current_rate == base_rate:
    new_rate = base_rate * 1.5       # e.g. 5.0% → 7.5%
    write_to_blockchain(bond_id, new_rate)
    send_alerts(bond_id, "PENALTY")

if consecutive_compliant_days >= 7 and current_rate > base_rate:
    new_rate = base_rate             # Reset to base
    write_to_blockchain(bond_id, new_rate)
    send_alerts(bond_id, "RECOVERY")
```

### Verdict States

| Verdict | Condition | Action |
|---|---|---|
| `COMPLIANT` | PR ≥ 0.75 | None |
| `PENALTY` | PR < 0.75 × 3 days | Rate hike + blockchain TX |
| `RECOVERY` | PR ≥ 0.75 × 7 days | Rate reset + blockchain TX |
| `IGNORED` | Missing data / IoT offline | Day excluded from streak |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- PostgreSQL 15
- Redis 7
- Docker & Docker Compose (recommended)
- A funded Polygon wallet (for blockchain writes)

### Quick Start with Docker

```bash
# 1. Clone the repository
git clone https://github.com/yourorg/greenbond-os.git
cd greenbond-os

# 2. Copy and configure environment variables
cp .env.example .env
# Edit .env with your API keys and wallet details

# 3. Start all services
docker-compose up -d

# 4. Run database migrations
docker-compose exec backend alembic upgrade head

# 5. Seed initial bond data (optional)
docker-compose exec backend python scripts/seed.py

# 6. Open the frontend
open http://localhost:5173
```

### Manual Setup (Development)

```bash
# Backend
cd backend
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8000

# Celery Worker (new terminal)
celery -A tasks.celery_app worker --loglevel=info

# Celery Beat Scheduler (new terminal)
celery -A tasks.celery_app beat --loglevel=info

# Redis (new terminal, or use Docker)
redis-server

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

---

## Environment Variables

Create a `.env` file in the project root. See `.env.example` for all options.

```env
# ── DATABASE ──────────────────────────────────────────────────
DATABASE_URL=postgresql://user:password@localhost:5432/greenbonds

# ── REDIS ─────────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379/0

# ── BLOCKCHAIN (Polygon) ──────────────────────────────────────
POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
WALLET_PRIVATE_KEY=0xYOUR_PRIVATE_KEY
CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT_ADDRESS

# ── NASA POWER API ────────────────────────────────────────────
NASA_API_BASE=https://power.larc.nasa.gov/api/temporal/daily/point
NASA_PARAMETERS=ALLSKY_SFC_SW_DWN      # GHI parameter

# ── ALERTS ────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=ACxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx

SENDGRID_API_KEY=SG.xxxxxxxx
ALERT_FROM_EMAIL=alerts@yourdomain.com

# ── APP ───────────────────────────────────────────────────────
SECRET_KEY=your-secret-key-here
DEBUG=false
CORS_ORIGINS=http://localhost:5173,https://yourdomain.com

# ── CELERY ────────────────────────────────────────────────────
CELERY_TIMEZONE=Asia/Kolkata
AUDIT_CRON_HOUR=6
AUDIT_CRON_MINUTE=0
```

---

## Backend: FastAPI

The backend exposes a REST API consumed by the React frontend. All endpoints return JSON.

### Running

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
# Interactive docs: http://localhost:8000/docs
```

### Key Services

**`services/pr_engine.py`** — Core PR calculation:
```python
def calculate_pr(actual_kwh: float, nasa_ghi: float, capacity_mw: float) -> float:
    expected_kwh = nasa_ghi * capacity_mw * 1000 * PERFORMANCE_FACTOR
    actual_ghi = actual_kwh / (capacity_mw * 1000 * PERFORMANCE_FACTOR)
    return actual_ghi / nasa_ghi
```

**`services/nasa.py`** — Fetches daily GHI for a GPS coordinate:
```python
async def get_ghi(lat: float, lng: float, date: str) -> float:
    # Calls NASA POWER API and returns GHI in kWh/m²
```

**`tasks/daily_audit.py`** — The main Celery task that runs every morning:
```python
@celery_app.task
def run_daily_audit():
    for bond in get_active_bonds():
        ghi = get_nasa_ghi(bond.lat, bond.lng)
        production = get_production(bond.id)
        pr = calculate_pr(production.kwh, ghi, bond.capacity_mw)
        verdict = evaluate_penalty(bond, pr)
        log_audit(bond.id, pr, ghi, verdict)
        if verdict in ("PENALTY", "RECOVERY"):
            tx_hash = write_to_blockchain(bond.id, new_rate)
            send_alerts(bond, verdict, tx_hash)
```

---

## Frontend: React

Built with React 18 + Vite. Bloomberg Terminal aesthetic using IBM Plex Mono and Barlow Condensed typefaces.

### Views

| View | Route | Description |
|---|---|---|
| Dashboard | `/` | Global KPIs, portfolio table, health map |
| Bond Detail | `/bonds/:id` | Full bond deep-dive with 5 tabs |
| Map View | `/map` | Portfolio plotted on India map |
| Alert Center | `/alerts` | Full notification history |
| Data Entry | `/entry` | Manual form + IoT sync status |
| System Health | `/health` | Service uptime, logs, Celery status |

### Bond Detail Tabs

- **Overview** — Info grid, performance panel, streak tracker, satellite context, financial impact, interest rate timeline
- **Analytics** — 60-day PR chart with penalty markers, production vs. NASA dual-area chart
- **Glass Box** — Expandable transparency accordion showing every step of PR calculation
- **Blockchain** — TX details (hash, gas, block), all-transactions table, raw JSON payload modal
- **Live Monitor** — Timestamped step-by-step audit event timeline

### Data Flow

```
FastAPI → React Query / SWR → State → Recharts / UI
```

### Running

```bash
cd frontend
npm install
npm run dev          # Development: http://localhost:5173
npm run build        # Production build → dist/
npm run preview      # Preview production build
```

---

## Blockchain Integration

### Smart Contract (Solidity)

Deployed on **Polygon Mainnet** for low gas costs and fast finality.

```solidity
// GreenBond.sol (simplified)
contract GreenBond {
    struct RateChange {
        uint256 timestamp;
        string bondId;
        uint256 previousRate;   // basis points (500 = 5.00%)
        uint256 newRate;
        string trigger;         // "PENALTY" or "RECOVERY"
        bytes32 dataHash;       // Hash of the PR data
    }

    mapping(string => RateChange[]) public rateHistory;

    event RateChanged(string bondId, uint256 newRate, string trigger);

    function recordRateChange(
        string memory bondId,
        uint256 newRate,
        string memory trigger,
        bytes32 dataHash
    ) public onlyOwner {
        rateHistory[bondId].push(RateChange(
            block.timestamp, bondId, getCurrentRate(bondId),
            newRate, trigger, dataHash
        ));
        emit RateChanged(bondId, newRate, trigger);
    }
}
```

### Deploying the Contract

```bash
cd backend/contracts
npm install -g hardhat
npx hardhat compile
npx hardhat run scripts/deploy.js --network polygon
# Copy the deployed address to CONTRACT_ADDRESS in .env
```

### Writing to Blockchain

```python
# services/blockchain.py
from web3 import Web3

def write_rate_change(bond_id: str, new_rate: float, trigger: str, pr_data: dict) -> str:
    w3 = Web3(Web3.HTTPProvider(settings.POLYGON_RPC_URL))
    contract = w3.eth.contract(address=settings.CONTRACT_ADDRESS, abi=ABI)
    data_hash = Web3.keccak(text=json.dumps(pr_data))

    tx = contract.functions.recordRateChange(
        bond_id, int(new_rate * 100), trigger, data_hash
    ).build_transaction({
        "from": wallet_address,
        "nonce": w3.eth.get_transaction_count(wallet_address),
        "gas": 100000,
        "gasPrice": w3.eth.gas_price,
    })

    signed = w3.eth.account.sign_transaction(tx, settings.WALLET_PRIVATE_KEY)
    tx_hash = w3.eth.send_raw_transaction(signed.rawTransaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)
    return receipt["transactionHash"].hex()
```

---

## NASA POWER API

All performance calculations are grounded in **NASA satellite GHI data**, making them objective and unmanipulable.

**Endpoint:** `https://power.larc.nasa.gov/api/temporal/daily/point`

**Example Request:**
```
GET https://power.larc.nasa.gov/api/temporal/daily/point
    ?parameters=ALLSKY_SFC_SW_DWN
    &community=RE
    &longitude=75.79
    &latitude=26.91
    &start=20250610
    &end=20250610
    &format=JSON
```

**Example Response:**
```json
{
  "properties": {
    "parameter": {
      "ALLSKY_SFC_SW_DWN": {
        "20250610": 5.83
      }
    }
  }
}
```

**Usage:** `5.83 kWh/m²` is the NASA-predicted solar irradiance for that day and location. This becomes the denominator in the PR formula.

The NASA POWER API is **free, requires no API key**, and has global coverage dating back to 1981.

---

## Celery & Scheduling

The audit pipeline runs automatically every morning via **Celery Beat**.

### Schedule Configuration

```python
# tasks/beat_schedule.py
from celery.schedules import crontab

CELERYBEAT_SCHEDULE = {
    "daily-green-bond-audit": {
        "task": "tasks.daily_audit.run_daily_audit",
        "schedule": crontab(hour=6, minute=0),   # 6:00 AM IST
    },
}
```

### Audit Pipeline (Step by Step)

```
06:00:00  Celery Beat fires the daily_audit task
06:00:12  NASA POWER API called for all active bond coordinates
06:00:14  GHI values received and cached in Redis
06:00:15  Production data fetched from PostgreSQL
06:00:15  PR calculated for each bond
06:00:15  Penalty/recovery engine evaluates streaks
06:01:xx  Blockchain TX submitted (if rate change triggered)
06:04:xx  TX confirmed on Polygon Mainnet
06:05:00  Alert pipeline triggered (Email + SMS)
06:05:09  Notifications delivered
06:05:11  Audit records written to PostgreSQL with TX hash
```

### Monitoring Celery

```bash
# Check worker status
celery -A tasks.celery_app inspect active

# Monitor in real time
celery -A tasks.celery_app events

# Flower web dashboard
pip install flower
celery -A tasks.celery_app flower --port=5555
# Open http://localhost:5555
```

---

## Alert System

Alerts are triggered for **every rate change** — both penalty hikes and recovery resets.

### Alert Types

| Type | Trigger | Channel |
|---|---|---|
| Penalty Alert | 3-day streak below PR threshold | SMS + Email |
| Recovery Alert | Rate reset to base after 7 compliant days | Email |
| Daily Warning | PR below threshold (streak ongoing) | System log |
| IoT Offline | Device stale > 24h | Email |

### Twilio SMS

```python
from twilio.rest import Client

def send_sms(to: str, body: str):
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    client.messages.create(to=to, from_=settings.TWILIO_FROM_NUMBER, body=body)
```

### SendGrid Email

```python
import sendgrid
from sendgrid.helpers.mail import Mail

def send_email(to: str, subject: str, html_content: str):
    sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)
    message = Mail(from_email=settings.ALERT_FROM_EMAIL, to_emails=to,
                   subject=subject, html_content=html_content)
    sg.send(message)
```

---

## Data Entry Modes

### Option A: IoT Auto-Sync

Inverters push data directly via REST API:

```
POST /api/production/iot
{
  "device_id": "INV-001",
  "bond_id": "GB-2024-001",
  "date": "2025-06-10",
  "kwh": 18500.4,
  "timestamp": "2025-06-10T18:00:00Z"
}
```

Supported inverter brands via MODBUS/SunSpec protocol adapters: Sungrow, Huawei, SMA, Fronius, ABB.

### Option B: Manual Entry

Via the frontend Data Entry form, or directly:

```
POST /api/production/manual
{
  "bond_id": "GB-2024-001",
  "date": "2025-06-10",
  "kwh": 18500,
  "notes": "Grid outage 14:00–16:00",
  "uploaded_by": "operator@example.com"
}
```

### Missing Days

Days with no production data are marked as `IGNORED` and excluded from the penalty streak calculation. The frontend's calendar view highlights missing days with a red dot indicator.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/bonds` | List all bonds |
| `GET` | `/api/bonds/:id` | Bond detail + current status |
| `POST` | `/api/bonds` | Create new bond |
| `GET` | `/api/bonds/:id/timeseries?days=60` | PR + energy time series |
| `GET` | `/api/audit?bond_id=&limit=` | Audit log with TX hashes |
| `GET` | `/api/alerts?bond_id=&severity=` | Alert history |
| `POST` | `/api/production/manual` | Submit manual kWh entry |
| `POST` | `/api/production/iot` | IoT device data push |
| `GET` | `/api/blockchain/tx/:hash` | Transaction details |
| `GET` | `/api/health` | System health check |
| `POST` | `/api/audit/run` | Manually trigger audit (admin) |

Full interactive docs available at `/docs` (Swagger UI) and `/redoc`.

---

## Database Schema

```sql
-- Core bond registry
CREATE TABLE bonds (
    id              VARCHAR(20) PRIMARY KEY,    -- "GB-2024-001"
    name            VARCHAR(100) NOT NULL,
    capacity_kw     DECIMAL(10,2) NOT NULL,
    lat             DECIMAL(9,6) NOT NULL,
    lng             DECIMAL(9,6) NOT NULL,
    base_rate       DECIMAL(5,3) NOT NULL,
    current_rate    DECIMAL(5,3) NOT NULL,
    status          VARCHAR(20) NOT NULL,        -- ACTIVE / PENALTY / MATURED
    tvl             BIGINT DEFAULT 0,
    created_at      TIMESTAMP DEFAULT NOW(),
    maturity_date   DATE
);

-- Daily PR audit records
CREATE TABLE audit_logs (
    id                      SERIAL PRIMARY KEY,
    bond_id                 VARCHAR(20) REFERENCES bonds(id),
    date                    DATE NOT NULL,
    nasa_ghi                DECIMAL(6,3),
    actual_kwh              DECIMAL(12,2),
    calculated_pr           DECIMAL(6,4),
    threshold               DECIMAL(4,2) DEFAULT 0.75,
    verdict                 VARCHAR(20),        -- COMPLIANT / PENALTY / IGNORED
    consecutive_penalty     INTEGER DEFAULT 0,
    consecutive_compliant   INTEGER DEFAULT 0,
    blockchain_tx_hash      VARCHAR(100),
    created_at              TIMESTAMP DEFAULT NOW()
);

-- Daily production entries (manual + IoT)
CREATE TABLE production_entries (
    id          SERIAL PRIMARY KEY,
    bond_id     VARCHAR(20) REFERENCES bonds(id),
    date        DATE NOT NULL,
    kwh         DECIMAL(12,2) NOT NULL,
    source      VARCHAR(20),                    -- MANUAL / IOT
    device_id   VARCHAR(50),
    notes       TEXT,
    uploaded_by VARCHAR(100),
    created_at  TIMESTAMP DEFAULT NOW(),
    UNIQUE(bond_id, date)
);

-- Alert history
CREATE TABLE alerts (
    id          SERIAL PRIMARY KEY,
    bond_id     VARCHAR(20) REFERENCES bonds(id),
    timestamp   TIMESTAMP DEFAULT NOW(),
    type        VARCHAR(20),                    -- BLOCKCHAIN / EMAIL / SMS / SYSTEM
    message     TEXT,
    tx_hash     VARCHAR(100),
    severity    VARCHAR(20),                    -- critical / warning / success
    status      VARCHAR(20)                     -- DELIVERED / CONFIRMED / LOGGED / FAILED
);
```

---

## Deployment

### Docker Compose (Production)

```yaml
# docker-compose.yml
version: "3.9"
services:
  postgres:
    image: postgres:15
    env_file: .env
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  backend:
    build:
      dockerfile: Dockerfile.backend
    env_file: .env
    depends_on: [postgres, redis]
    ports:
      - "8000:8000"

  celery-worker:
    build:
      dockerfile: Dockerfile.backend
    command: celery -A tasks.celery_app worker --loglevel=info
    env_file: .env
    depends_on: [redis, postgres]

  celery-beat:
    build:
      dockerfile: Dockerfile.backend
    command: celery -A tasks.celery_app beat --loglevel=info
    env_file: .env
    depends_on: [redis]

  frontend:
    build:
      dockerfile: Dockerfile.frontend
    ports:
      - "80:80"
    depends_on: [backend]

volumes:
  pgdata:
```

```bash
docker-compose up -d --build
docker-compose exec backend alembic upgrade head
```

### Production Checklist

- [ ] Set `DEBUG=false` in `.env`
- [ ] Use a secrets manager for `WALLET_PRIVATE_KEY` (never commit to git)
- [ ] Configure Nginx reverse proxy with SSL (Let's Encrypt)
- [ ] Set up PostgreSQL backups (daily)
- [ ] Enable Polygon Mainnet (not Mumbai testnet)
- [ ] Verify Twilio and SendGrid accounts are out of trial mode
- [ ] Test the full audit pipeline manually with `/api/audit/run`
- [ ] Monitor Celery worker health with Flower or your APM tool

---

## Roadmap

**v1.1 — Q3 2025**
- [ ] Mapbox GL integration for live satellite weather overlay
- [ ] Multi-tenant support (multiple issuers, separate dashboards)
- [ ] Webhook support for third-party integrations
- [ ] Historical backtesting tool (simulate penalty impact on past data)

**v1.2 — Q4 2025**
- [ ] Mobile app (React Native)
- [ ] Wind speed data integration (for wind bonds)
- [ ] Automated inverter MODBUS polling agent
- [ ] ISO 50001 compliance report export (PDF)

**v2.0 — 2026**
- [ ] DeFi integration — let investors buy/sell bond exposure as tokens
- [ ] Multi-chain support (Ethereum mainnet, Arbitrum)
- [ ] AI-powered anomaly detection (flag suspicious production data)
- [ ] Carbon credit bridge (link PR compliance to carbon offset issuance)

---

## License

MIT License. See `LICENSE` for details.

---

## Contact

Built for the green finance ecosystem.  
For enterprise inquiries, custom deployments, or partnership opportunities — open an issue or reach out at `hello@greenbond.io`

---

> *"Not a black box. Every number, every rule, every consequence — visible, verifiable, permanent."*
