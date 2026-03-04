# ⬡ GreenBond OS

**A blockchain-verified smart green bond monitoring platform.**  
Automated performance tracking, NASA-data-driven compliance scoring, penalty enforcement, and immutable on-chain audit trails — all in one operational system.

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
│   React (Vite) · IBM Plex Mono · Recharts · Bloomberg UI    │
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

### Deploying the Contract

```bash
cd backend/contracts
npm install -g hardhat
npx hardhat compile
npx hardhat run scripts/deploy.js --network polygon
# Copy the deployed address to CONTRACT_ADDRESS in .env
```

---

## NASA POWER API

All performance calculations are grounded in **NASA satellite GHI data**, making them objective and unmanipulable.

---

## Celery & Scheduling

The audit pipeline runs automatically every morning via **Celery Beat**.

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

---

## Data Entry Modes

### Option A: IoT Auto-Sync

Inverters push data directly via REST API:
Supported inverter brands via MODBUS/SunSpec protocol adapters: Sungrow, Huawei, SMA, Fronius, ABB.

### Option B: Manual Entry

Via the frontend Data Entry form

### Missing Days

Days with no production data are marked as `IGNORED` and excluded from the penalty streak calculation. The frontend's calendar view highlights missing days with a red dot indicator.
---

## Deployment

### Docker Compose (Production)

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

## License

MIT License. See `LICENSE` for details.

---

## Contact

Built for the green finance ecosystem.  
For enterprise inquiries, custom deployments, or partnership opportunities — open an issue

---

> *"Not a black box. Every number, every rule, every consequence — visible, verifiable, permanent."*
