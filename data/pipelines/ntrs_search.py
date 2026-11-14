"""Search the NASA Technical Reports Server (NTRS) for combustion papers.

The NTRS search API is public and returns JSON with full metadata including
abstracts and file-download links (PDF + auto-extracted fulltext .txt).

Outputs (under data/raw/):
    ntrs_<query>.json        raw search response per query
    ntrs_citations.json      merged, de-duplicated citation catalog with
                             per-investigation linkage (input to the RAG index)
    ntrs_txt/<id>.txt        fulltext dumps (--fulltext N per investigation)

Usage:
    python data/pipelines/ntrs_search.py "cool flames FLEX"
    python data/pipelines/ntrs_search.py --all --size 15
    python data/pipelines/ntrs_search.py --all --fulltext 2
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
TXT_DIR = RAW_DIR / "ntrs_txt"
NTRS_URL = "https://ntrs.nasa.gov/api/citations/search"
NTRS_BASE = "https://ntrs.nasa.gov"

# investigation id -> NTRS queries (short queries — the API ANDs terms)
QUERIES = {
    "flex-2": ["flame extinguishment experiment", "FLEX droplet combustion",
               "cool flames microgravity"],
    "acme": ["burning rate emulator", "coflow diffusion flame soot",
             "spherical diffusion flames microgravity"],
    "sofie-gel": ["SoFIE solid fuel ignition extinction",
                  "solid fuel ignition extinction microgravity"],
    "bass-ii": ["BASS flame spread microgravity", "burning suppression solids"],
    "saffire": ["Saffire spacecraft fire", "spacecraft fire safety experiment"],
    "same": ["smoke aerosol measurement", "smoke particle microgravity"],
    "confined-combustion": ["confined combustion microgravity",
                            "flame spread confined"],
    "flare": ["partial gravity flammability",
              "flame spread extinction partial gravity"],
}

HEADERS = {"User-Agent": "flame-in-freefall-hackathon/0.1 (NASA Space Apps 2026)"}


def fetch(query: str, size: int) -> dict:
    params = urllib.parse.urlencode({"q": query, "size": size})
    req = urllib.request.Request(f"{NTRS_URL}?{params}", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def safe_name(query: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", query.lower()).strip("_") or "query"


def slim(r: dict, inv: str) -> dict:
    """Keep the fields the RAG corpus actually needs."""
    downloads = []
    for d in r.get("downloads") or []:
        links = d.get("links") or {}
        downloads.append({
            "name": d.get("name"),
            "type": d.get("type"),
            "mimetype": d.get("mimetype"),
            "pdf": links.get("pdf"),
            "fulltext": links.get("fulltext"),
        })
    year = None
    for key in ("distributionDate", "submittedDate", "created"):
        v = r.get(key)
        if isinstance(v, str) and len(v) >= 4 and v[:4].isdigit():
            year = int(v[:4])
            break
    sti = r.get("stiTypeDetails")
    if isinstance(sti, dict):
        sti = sti.get("name")
    elif isinstance(sti, list):
        sti = sti[0].get("name") if sti and isinstance(sti[0], dict) else None
    if not sti:
        sti = r.get("stiType") if isinstance(r.get("stiType"), str) else None
    return {
        "id": r.get("id"),
        "title": r.get("title"),
        "abstract": r.get("abstract"),
        "year": year,
        "stiType": sti,
        "center": (r.get("center") or {}).get("name"),
        "authors": [
            " ".join(p for p in [a.get("first"), a.get("last")] if p)
            for a in (r.get("authorAffiliations") or [])[:6]
            if isinstance(a, dict)
        ],
        "reportNumber": (r.get("otherReportNumbers") or [None])[0]
        if isinstance(r.get("otherReportNumbers"), list) else None,
        "ntrsUrl": f"https://ntrs.nasa.gov/citations/{r.get('id')}",
        "downloads": downloads,
        "investigationIds": [inv],
    }


def merge(catalog_path: Path, rec: dict) -> None:
    cat = json.loads(catalog_path.read_text()) if catalog_path.exists() else {}
    cur = cat.get(rec["id"], rec)
    invs = sorted({*cur.get("investigationIds", []), *rec["investigationIds"]})
    cur.update({k: v for k, v in rec.items() if v is not None or k == "abstract"})
    cur["investigationIds"] = invs
    cat[rec["id"]] = cur
    catalog_path.write_text(json.dumps(cat, indent=1, ensure_ascii=False),
                            encoding="utf-8")


def download_fulltext(rec: dict) -> bool:
    for d in rec.get("downloads", []):
        link = d.get("fulltext")
        if not link:
            continue
        dest = TXT_DIR / f"{rec['id']}.txt"
        if dest.exists():
            return True
        try:
            req = urllib.request.Request(NTRS_BASE + link, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                body = resp.read()[:2_000_000]
        except Exception:  # noqa: BLE001
            continue
        if len(body) > 500:
            dest.write_bytes(body)
            return True
    return False


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("query", nargs="?", help="NTRS full-text query")
    parser.add_argument("--all", action="store_true",
                        help="run per-investigation query set")
    parser.add_argument("--size", type=int, default=10, help="max results per query")
    parser.add_argument("--fulltext", type=int, default=0, metavar="N",
                        help="download up to N fulltext .txt per investigation")
    args = parser.parse_args()

    if not args.all and not args.query:
        parser.error("pass a query or --all")

    RAW_DIR.mkdir(parents=True, exist_ok=True)
    TXT_DIR.mkdir(parents=True, exist_ok=True)
    catalog_path = RAW_DIR / "ntrs_citations.json"

    queries = QUERIES if args.all else {"adhoc": [args.query]}
    for inv, qs in queries.items():
        kept = got_txt = 0
        for q in qs:
            try:
                payload = fetch(q, args.size)
            except Exception as exc:  # noqa: BLE001
                print(f"[FAIL] {inv} {q!r}: {exc}", file=sys.stderr)
                continue
            out = RAW_DIR / f"ntrs_{inv}_{safe_name(q)[:40]}.json"
            out.write_text(json.dumps(payload, indent=1, ensure_ascii=False),
                           encoding="utf-8")
            for r in payload.get("results", []):
                rec = slim(r, inv)
                if not rec.get("id") or not rec.get("title"):
                    continue
                merge(catalog_path, rec)
                kept += 1
                if args.fulltext and got_txt < args.fulltext:
                    if download_fulltext(rec):
                        got_txt += 1
        print(f"[OK] {inv}: {kept} citations merged"
              + (f", {got_txt} fulltext downloaded" if args.fulltext else ""))

    cat = json.loads(catalog_path.read_text()) if catalog_path.exists() else {}
    print(f"\n[DONE] {len(cat)} unique citations -> {catalog_path.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
