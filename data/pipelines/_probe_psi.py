"""Probe: file-tree stats for all combustion studies."""
import json
import urllib.request
import urllib.error
import collections

BASE = "https://psi.nasa.gov/geode-py/ws"
H = {"User-Agent": "flame-in-freefall-hackathon/0.1",
     "Content-Type": "application/json"}

STUDIES = {
    "PSI-69": "FLEX", "PSI-68": "FLEX-2", "PSI-39": "CFI",
    "PSI-10": "ACME FlameDesign", "PSI-20": "ACME BRE", "PSI-21": "ACME CLD",
    "PSI-22": "ACME E-field", "PSI-23": "ACME spherical",
    "PSI-106": "SLICE", "PSI-107": "SmokePoint", "PSI-159": "ACME CoolFlames",
    "PSI-26": "BASS", "PSI-25": "BASS-II",
    "PSI-98": "Saffire-I", "PSI-99": "Saffire-II", "PSI-100": "Saffire-III",
    "PSI-101": "SAME-R", "PSI-102": "SAME", "PSI-115": "SAME-modeling",
    "PSI-47": "DAMF", "PSI-60": "SPICE", "PSI-62": "FlameletModeling",
    "PSI-117": "CoolFlamePerturb", "PSI-142": "CoolFlameTransitions",
    "PSI-179": "ASE",
}


def call(method, url, body=None, limit=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, headers=H, method=method)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            return resp.status, resp.read()[:limit]
    except urllib.error.HTTPError as e:
        return e.code, e.read()[:300]
    except Exception as e:
        return -1, str(e)[:200]


def walk(n, out):
    if n.get("files"):
        for c in n["files"]:
            walk(c, out)
    else:
        out.append(n)


for sid, label in STUDIES.items():
    code, body = call("POST", BASE + "/files/v2",
                      {"folder": "", "fileType": "study", "studyId": sid,
                       "version": "1", "obfuscationcode": ""}, limit=40_000_000)
    if code != 200:
        print(f"{sid} {label:20s} -> {code} {body[:120]}")
        continue
    leaves = []
    walk(json.loads(body), leaves)
    ext = collections.Counter()
    small = 0
    for n in leaves:
        k = n.get("key", "")
        e = k.rsplit(".", 1)[-1].lower() if "." in k else "(none)"
        ext[e] += 1
        if n.get("bytes_size", 0) < 20000:
            small += 1
    top = ", ".join(f"{e}:{c}" for e, c in ext.most_common(6))
    print(f"{sid} {label:20s} -> {len(leaves):5d} files ({small} <20KB) | {top}")
