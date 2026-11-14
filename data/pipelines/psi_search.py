"""Search the NASA Physical Sciences Informatics (PSI) data repository.

PSI is an Angular app backed by an Elasticsearch-style API at
    https://psi.nasa.gov/geode-py/ws/repo/search
Params: term, source, type, from, size, sort, order, ffield/fvalue.
Responses contain the full public investigation metadata (_source):
Accession, Title, Objectives, Approach, Hypothesis, investigators, dates,
platform, keywords, related investigations.

Raw hits are saved to data/raw/psi_search_<query>.json and the merged,
de-duplicated catalog to data/raw/psi_investigations.json.

Usage:
    python data/pipelines/psi_search.py "cool flames"
    python data/pipelines/psi_search.py --all
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # data/
RAW_DIR = ROOT / "raw"
PSI_API = "https://psi.nasa.gov/geode-py/ws"

# Investigations of interest for the Flame in Freefall challenge.
DEFAULT_QUERIES = [
    "microgravity combustion",
    "flame spread microgravity",
    "solid fuel ignition extinction",
    "cool flames droplet",
    "spacecraft fire saffire",
    "smoke aerosol measurement",
    "flame extinguishment",
    "burning suppression solids",
    "laminar diffusion flame coflow",
]

HEADERS = {"User-Agent": "flame-in-freefall-hackathon/0.1 (NASA Space Apps 2026)"}


def fetch(query: str, size: int, start: int = 0) -> dict:
    params = {"term": query, "size": size}
    if start:
        params["from"] = start
    url = f"{PSI_API}/repo/search?{urllib.parse.urlencode(params)}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def safe_name(query: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", query.lower()).strip("_") or "query"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("queries", nargs="*", help="free-text PSI queries")
    parser.add_argument("--size", type=int, default=50, help="results per query")
    parser.add_argument(
        "--all",
        action="store_true",
        help="run the built-in list of combustion-related queries",
    )
    args = parser.parse_args()

    queries = DEFAULT_QUERIES if args.all else (args.queries or ["microgravity combustion"])
    RAW_DIR.mkdir(parents=True, exist_ok=True)

    catalog: dict[str, dict] = {}
    cat_path = RAW_DIR / "psi_investigations.json"
    if cat_path.exists():
        catalog = {i["Accession"]: i for i in json.loads(cat_path.read_text())}

    for q in queries:
        out = RAW_DIR / f"psi_search_{safe_name(q)}.json"
        try:
            payload = fetch(q, args.size)
        except Exception as exc:  # noqa: BLE001 - network errors must not abort batch
            print(f"[FAIL] {q!r}: {exc}", file=sys.stderr)
            continue
        out.write_text(json.dumps(payload, indent=1), encoding="utf-8")
        hits = payload.get("hits", {}).get("hits", [])
        for h in hits:
            src = h.get("_source", {})
            acc = src.get("Accession")
            if acc:
                catalog[acc] = src
        total = payload.get("hits", {}).get("total", "?")
        print(f"[OK]   {q!r} -> {out.relative_to(ROOT)} "
              f"({len(hits)}/{total} hits)")

    cat_path.write_text(
        json.dumps(sorted(catalog.values(), key=lambda i: i.get("Accession", "")),
                   indent=1, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\n[OK] merged catalog -> {cat_path.relative_to(ROOT)} "
          f"({len(catalog)} investigations)")
    print("Next: python data/pipelines/psi_files.py --all")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
