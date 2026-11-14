"""Search the NASA Physical Sciences Informatics (PSI) data repository.

PSI has no documented public API; the repository search endpoint is used as
the entry point. Raw results are saved to data/raw/psi_search_<query>.json.

Usage:
    python scripts/psi_search.py "microgravity combustion"
    python scripts/psi_search.py --all
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
PSI_SEARCH_URL = "https://psi.nasa.gov/physci/repo/search"

# Investigations of interest for the Flame in Freefall challenge.
DEFAULT_QUERIES = [
    "microgravity combustion",
    "flame spread microgravity",
    "solid fuel ignition extinction",
    "smoke aerosol",
    "spacecraft fire",
    "partial gravity flammability",
]

HEADERS = {"User-Agent": "flame-in-freefall-hackathon/0.1 (NASA Space Apps 2026)"}


def fetch(query: str) -> str:
    params = urllib.parse.urlencode(
        {"q": query, "data_source": "psi", "data_type": "investigation"}
    )
    req = urllib.request.Request(f"{PSI_SEARCH_URL}?{params}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", errors="replace")


def safe_name(query: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", query.lower()).strip("_") or "query"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("queries", nargs="*", help="free-text PSI queries")
    parser.add_argument(
        "--all",
        action="store_true",
        help="run the built-in list of combustion-related queries",
    )
    args = parser.parse_args()

    queries = DEFAULT_QUERIES if args.all else (args.queries or ["microgravity combustion"])
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    for q in queries:
        out = RAW_DIR / f"psi_search_{safe_name(q)}.json"
        try:
            html_or_json = fetch(q)
        except Exception as exc:  # noqa: BLE001 - network errors must not abort batch
            print(f"[FAIL] {q!r}: {exc}", file=sys.stderr)
            continue
        out.write_text(html_or_json, encoding="utf-8")
        print(f"[OK]   {q!r} -> {out.relative_to(ROOT)} ({len(html_or_json)} bytes)")

    print("\nNext step: inspect the raw responses, then run scripts/build_dataset.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
