from database import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        conn.execute(text("""
            ALTER TABLE bonds
            ADD COLUMN IF NOT EXISTS registered_on_chain BOOLEAN NOT NULL DEFAULT FALSE,
            ADD COLUMN IF NOT EXISTS registration_tx_hash VARCHAR(100),
            ADD COLUMN IF NOT EXISTS registration_block BIGINT;
        """))
        conn.execute(text("""
            ALTER TABLE audit_logs
            ADD COLUMN IF NOT EXISTS gas_used INTEGER;
        """))
        conn.commit()
        print("✅ Migration complete — columns added successfully.")

if __name__ == "__main__":
    run()


def backfill_existing_registrations():
    from database import SessionLocal
    from models import Bond
    db = SessionLocal()
    try:
        already_registered = ["GB-2025-001", "GB-2025-002", "GB-2025-004"]
        for bond_id in already_registered:
            bond = db.query(Bond).filter(Bond.id == bond_id).first()
            if bond:
                bond.registered_on_chain = True
                print(f"  ✓ Marked {bond_id} as registered")
        db.commit()
        print("✅ Backfill complete.")
    finally:
        db.close()


if __name__ == "__main__":
    run()
    backfill_existing_registrations()
