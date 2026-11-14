# Dataset schema — `src/data/investigations.json`

The app consumes a single JSON file typed as `Dataset` in `src/types.ts`.

```jsonc
{
  "schemaVersion": 1,
  "generated": "curated-starter | psi-ntrs-pipeline",
  "note": "provenance note",
  "investigations": [ /* Investigation[] */ ]
}
```

## Investigation record

| Field | Type | Notes |
|---|---|---|
| `id` | string | slug, unique (e.g. `sofie-gel`) |
| `name` | string | short name shown in UI |
| `title` | string | full investigation title |
| `agencies` | string[] | e.g. `["NASA"]`, `["JAXA","NASA"]` |
| `platform` | string | ISS, Cygnus, Kibo… |
| `facility` | string\|null | CIR, MSG, Glovebox… |
| `years` | string | e.g. `"2009–2014"` |
| `status` | `completed`\|`ongoing` | |
| `category` | enum | `solid-flame-spread`, `droplet`, `gaseous-diffusion`, `large-scale-fire`, `smoke-aerosol`, `confined`, `partial-gravity` |
| `gravity` | enum | `microgravity`, `partial-gravity`, `mixed` |
| `fuels` | string[] | material names |
| `conditions.oxygenPct` | `[min,max]`\|null | tested O₂ range |
| `conditions.flowCms` | `[min,max]`\|null | forced-flow range |
| `conditions.pressureKpa` | number\|null | ambient pressure |
| `conditions.explorationRelevant` | boolean | relevant to Moon/Mars missions |
| `metrics.limitingOxygenPct` | number\|null | LOC — lower = more hazardous |
| `metrics.flameSpreadRateCms` | `{min,max}`\|null | |
| `metrics.coolFlameObserved` | boolean | FLEX-type hidden combustion |
| `metrics.smolderObserved` | boolean | |
| `keyFindings` | string[] | 2–4 bullets, plain language |
| `safetyImplications` | string[] | actionable fire-safety takeaways |
| `hazards` | enum[] | see `HazardTag` in `src/types.ts` |
| `data.availability` | `full`\|`partial`\|`metadata-only` | |
| `data.psiUrl` | string\|null | PSI record link |
| `publications` | number | rough count of related papers |
| `verified` | boolean | `false` = starter value pending PSI verification |

## Pipeline

```bash
python scripts/psi_search.py --all          # raw PSI searches -> data/raw/
python scripts/ntrs_search.py "<query>"     # NTRS papers -> data/raw/
# normalize into structured records:
#   data/raw/structured/<name>.json  (array or single record, same schema)
python scripts/build_dataset.py              # merges into src/data/investigations.json
python scripts/build_dataset.py --sample     # restore starter dataset
```
