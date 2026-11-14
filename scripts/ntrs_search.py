"""Search the NASA Technical Reports Server (NTRS) for combustion papers.

The NTRS search API is public and returns JSON with full metadata.
Results are saved to data/raw/ntrs_<query>.json for later curation.

Usage:
    python scripts/ntrs_search.py "microgravity flame spread spacecraft fire"
    python scripts/ntrs_search.py --size 25 "cool flames FLEX"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"
NTRS_URL = "https://ntrs.nasa.gov/api/citations/search"

HEADERS = {"User-Agent": "flame-in-freefall-hackathon/0.1 (NASA Space Apps 2026)"}


def fetch(query: str, size: int) -> dict:
    params = urllib.parse.urlencode({"q": query, "size": size})
    req = urllib.request.Request(f"{NTRS_URL}?{params}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def safe_name(query: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", query.lower()).strip("_") or "query"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", help="NTRS full-text query")
    parser.add_argument("--size", type=int, default=10, help="max results (default 10)")
    args = parser.parse_args()

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    try:
        payload = fetch(args.query, args.size)
    except Exception as exc:  # noqa: BLE001
        print(f"[FAIL] {args.query!r}: {exc}", file=sys.stderr)
        return 1

    out = RAW_DIR / f"ntrs_{safe_name(args.query)}.json"
    out.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    results = payload.get("results", [])
    print(f"[OK] {args.query!r} -> {out.relative_to(ROOT)} ({len(results)} results)")
    for r in results[: args.size]:
        title = (r.get("title") or "untitled")[:80]
        print(f"  - {title}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
