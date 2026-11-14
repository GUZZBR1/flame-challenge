"""Bake the investigation-intelligence payload into the site bundle.

The dashboard section fetches the live /api/investigations + /api/insights
endpoints when the backend is up; for a static/offline demo (judges
opening the built site) it falls back to this generated snapshot —
same service code, same numbers, provenance intact.

Outputs:
    site/src/data/psi_snapshot.json   (imported by the React bundle)

Usage:
    python data/pipelines/build_site_snapshot.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent          # data/
REPO = ROOT.parent
OUT = REPO / "site" / "src" / "data" / "psi_snapshot.json"

sys.path.insert(0, str(REPO))
from backend.services import investigations  # noqa: E402


def main() -> int:
    investigations.reload()
    lb = investigations.leaderboard()
    details = {c["id"]: investigations.detail(c["id"]) for c in lb["items"]}
    ins = investigations.insights()
    snapshot = {
        "generated": "build_site_snapshot.py",
        "leaderboard": lb,
        "details": details,
        "insights": ins,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(snapshot, indent=1))
    top = lb["items"][0] if lb["items"] else {}
    print(f"[DONE] site snapshot -> {OUT.relative_to(REPO)} "
          f"({len(lb['items'])} investigations, "
          f"{len(ins['items'])} insights, top: {top.get('name')})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
