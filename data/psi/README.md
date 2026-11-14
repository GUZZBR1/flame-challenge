# NASA PSI combustion datasets

Real microgravity combustion data downloaded from the public
[NASA Physical Sciences Informatics (PSI) repository](https://psi.nasa.gov/physci/repo)
and normalized for the Flame in Freefall dashboard and insights engine.

## What is here

| Folder | Contents | Committed? |
| --- | --- | --- |
| `raw/` | Original files as downloaded from PSI, grouped by investigation (`<ACC>/<category>/`) | no (`.gitignore`) |
| `catalog/` | `investigations.csv` (one row per investigation), `files_manifest.csv` (one row per downloaded file), `data_dictionary.md` | yes |
| `processed/` | Cleaned tables ready to consume: `experimental_runs.csv`, `flex_test_points.csv`, `telemetry_index.csv`, `xlsx_csv/` | yes, except `xlsx_csv/` |

> **Note — this is a committed, pre-normalized corpus** produced by an
> earlier pipeline iteration (`scripts/psi/`, since removed). It is now
> consumed as an *additional source* by `data/pipelines/normalize_experiments.py`
> (`parse_legacy_runs` / `parse_legacy_flex`), which merges it into
> `data/processed/experiments.csv` for accessions the raw-file parsers
> never reached (BASS, SAFFIRE, FLEX test points, extra ACME studies).

## Investigations covered

13 combustion-science investigations, centred on the three families named in
the challenge (FLEX, SAFFIRE, ACME) plus the closely related BASS program:

- **FLEX / FLEX-2 / cool flames** — `PSI-69`, `PSI-68`, `PSI-142`: droplet
  burning, extinction diameter (Dext), cool-flame triggers.
- **SAFFIRE I/II/III** — `PSI-98`, `PSI-99`, `PSI-100`: large-scale fires inside
  Cygnus vehicles; airflow, O₂/CO₂, thermocouple and radiometer telemetry.
- **ACME** — `PSI-10`, `PSI-20`, `PSI-21`, `PSI-22`, `PSI-23`, `PSI-159`:
  gaseous flames, soot limits, electric-field effects, cool flames in gases.
- **BASS** — `PSI-26`: burning and suppression of solid materials.

## Refresh / reproduce

The original fetch/catalog/normalize scripts (`scripts/psi/psi_fetch.py`,
`psi_catalog.py`, `psi_normalize.py`) were removed when the ETL moved to
`data/pipelines/`. To regenerate this corpus, use the current pipeline:

```sh
python data/pipelines/psi_search.py --all   # catalog
python data/pipelines/psi_files.py --all    # per-test file download
python data/pipelines/normalize_experiments.py  # folds these CSVs into
                                                # processed/experiments.csv
```

`psi_search.py`/`psi_files.py` talk to the PSI `geode-py` API — no login is
needed for public investigations. Large video/image archives are deliberately
excluded; the policy is documented inside the scripts.

## License / attribution

All PSI investigations are released under **CC0-1.0**. Cite the investigation
DOIs listed in `catalog/investigations.csv` when publishing results.
