import argparse
import secrets
import string
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import SessionLocal
from app.models import AccessCode

ALPHABET = "".join(ch for ch in string.ascii_uppercase + string.digits if ch not in "0O1I")


def make_code(prefix: str) -> str:
    random_part = "".join(secrets.choice(ALPHABET) for _ in range(12))
    grouped = "-".join(random_part[i:i + 4] for i in range(0, len(random_part), 4))
    return f"{prefix}-{grouped}" if prefix else grouped


def parse_expires_at(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value)


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate one-time access codes.")
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--prefix", default="SM")
    parser.add_argument("--batch", default=datetime.now().strftime("batch-%Y%m%d"))
    parser.add_argument("--description", default="Generated invite code")
    parser.add_argument("--max-uses", type=int, default=1)
    parser.add_argument("--plan-type", default="invite")
    parser.add_argument("--expires-at", default=None, help="ISO datetime, e.g. 2026-12-31T23:59:59")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if args.count <= 0:
        raise SystemExit("--count must be greater than 0")
    if args.max_uses <= 0:
        raise SystemExit("--max-uses must be greater than 0")

    expires_at = parse_expires_at(args.expires_at)
    created: list[str] = []
    existing: set[str] = set()

    if args.dry_run:
        while len(created) < args.count:
            code = make_code(args.prefix)
            if code in existing:
                continue
            existing.add(code)
            created.append(code)
    else:
        db = SessionLocal()
        try:
            existing = {row[0] for row in db.query(AccessCode.code).all()}
            while len(created) < args.count:
                code = make_code(args.prefix)
                if code in existing:
                    continue
                existing.add(code)
                created.append(code)
                db.add(AccessCode(
                    code=code,
                    description=args.description,
                    is_active=True,
                    max_uses=args.max_uses,
                    used_count=0,
                    expires_at=expires_at,
                    plan_type=args.plan_type,
                    batch=args.batch,
                ))
            db.commit()
        finally:
            db.close()

    for code in created:
        print(code)
    action = "Generated" if args.dry_run else "Inserted"
    print(f"{action} {len(created)} access codes in batch {args.batch}.", file=sys.stderr)


if __name__ == "__main__":
    main()
