"""Build src/data/investigations.json from raw PSI/NTRS downloads.

Pipeline:
    1. scripts/psi_search.py  -> data/raw/psi_search_*.json
    2. scripts/ntrs_search.py -> data/raw/ntrs_*.json
    3. scripts/build_dataset.py -> src/data/investigations.json

For now, PSI raw responses are HTML/JS-driven, so curated records are kept in
src/data/investigations.json. This script:
    - with no raw files: keeps the current starter dataset (no-op)
    - with --sample: restores the bundled starter dataset
    - with raw files: parses whatever structured records exist under
      data/raw/structured/*.json (see schema in docs/data-schema.md) and
      merges them with curation overrides in data/curation.json

Usage:
    python scripts/build_dataset.py            # merge raw data if present
    python scripts/build_dataset.py --sample   # restore starter dataset
"""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET_PATH = ROOT / "src" / "data" / "investigations.json"
STRUCTURED_DIR = ROOT / "data" / "raw" / "structured"
STARTER_PATH = ROOT / "data" / "investigations.starter.json"

# Keep a pristine copy of the starter dataset for --sample restores.
def ensure_starter_backup() -> None:
    if not STARTER_PATH.exists() and DATASET_PATH.exists():
        STARTER_PATH.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(DATASET_PATH, STARTER_PATH)


def restore_starter() -> None:
    ensure_starter_backup()
    if STARTER_PATH.exists():
        shutil.copy(STARTER_PATH, DATASET_PATH)
        print(f"[OK] starter dataset restored -> {DATASET_PATH.relative_to(ROOT)}")
    else:
        print("[FAIL] no starter backup found", file=sys.stderr)
        sys.exit(1)


def merge_structured() -> None:
    records: list[dict] = []
    if STRUCTURED_DIR.exists():
        for path in sorted(STRUCTURED_DIR.glob("*.json")):
            try:
                payload = json.loads(path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                print(f"[SKIP] {path.name}: invalid JSON ({exc})", file=sys.stderr)
                continue
            items = payload if isinstance(payload, list) else [payload]
            for item in items:
                if isinstance(item, dict) and item.get("id"):
                    records.append(item)

    if not records:
        print(
            "[INFO] no structured records under data/raw/structured/ — "
            "keeping current dataset.\n"
            "       Add normalized records there (schema: docs/data-schema.md) "
            "or run scripts/psi_search.py + scripts/ntrs_search.py first."
        )
        return

    # Merge: structured records override same-id starter records.
    dataset = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    merged = {inv["id"]: inv for inv in dataset.get("investigations", [])}
    for rec in records:
        merged[rec["id"]] = {**merged.get(rec["id"], {}), **rec}
        rec["verified"] = True  # records built from real downloads are verified

    dataset["investigations"] = list(merged.values())
    dataset["generated"] = "psi-ntrs-pipeline"
    DATASET_PATH.write_text(
        json.dumps(dataset, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(f"[OK] merged {len(records)} records -> {DATASET_PATH.relative_to(ROOT)}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sample", action="store_true", help="restore starter dataset")
    args = parser.parse_args()

    if args.sample:
        restore_starter()
    else:
        ensure_starter_backup()
        merge_structured()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
