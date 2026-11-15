# Challenge Brief — Flame in Freefall (NASA Space Apps 2026)

> **Flame in Freefall: SI-Powered Fire Safety Insights from Microgravity Combustion Data**
> Level: Intermediate / Advanced · Theme: Space Exploration

## Official statement (paraphrased)

For decades, NASA has studied how flames and fire behave in microgravity,
gathering a trove of experimental data. That knowledge matters more than ever
as humans return to the Moon and press on to Mars, yet the volume of results
makes them hard to find, compare, and understand.

**Task:** create an interactive, AI/SI-powered dashboard that **summarizes,
ranks, and interprets** those findings to deliver **fire-safety insights for
human space exploration**.

## Official resources

- Challenge page: https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- PSI data repository: https://psi.nasa.gov/physci/repo
  (search endpoint: `https://psi.nasa.gov/physci/repo/search?q=…&data_source=psi&data_type=investigation`)
- NASA PSI program: https://science.nasa.gov/physical-sciences-informatics-psi/history-of-physical-science-informatics/
- NTRS API (papers/reports): `https://ntrs.nasa.gov/api/citations/search?q=…`
- NASA SVS visuals — "Studies Fire in Microgravity" (SoFIE-GEL):
  https://svs.gsfc.nasa.gov/31394/

## Key investigations in scope

| Investigation | Focus | Why it matters for fire safety |
|---|---|---|
| SoFIE / SoFIE-GEL | Solid fuel ignition/extinction, flame spread limits | Flame persists below Earth flammability limits in µg |
| BASS / BASS-II | Burning & suppression of solids (MSG duct) | Extinction regimes; elevated-O₂ hazard |
| SPICE / SLICE | MSG coflow jet flames — smoke point & liftoff | Soot inception; flame attachment in ducts |
| FLEX / FLEX-2 | Droplet combustion + CO₂/He/N₂ dilution | Cool flames burn invisibly after flameout; suppressant efficacy |
| ACME (incl. E-FIELD, CFI-G, Flame Design) | Laminar coflow flames, soot, BRE | Soot/soot transport; E-field as partial-g analog |
| Saffire I–VI | Large-scale fires in Cygnus | Real-scale spread rates; post-fire atmosphere |
| SAME / SAME-R (PSI-102/101) | Smoke aerosol measurement + reflight | µg smoke particles defeat Earth-calibrated detectors |
| Confined Combustion | Flame spread in confined volumes | Rack/duct geometries; exploration atmospheres |
| FLARE (JAXA) | Flammability at 0.17 g / 0.38 g | Direct Moon/Mars gravity fire data |

## Explicitly out of scope

Rocket-motor and propellant combustion: at engine speeds combustion is
gravity-independent. All modeling targets **cabins, habitats, stations
and crewed vehicles** — ISS, Gateway, lunar surface, Mars transit.

## What this repo builds

An interactive dashboard that:

1. **Summarizes** each investigation (SI-generated plain-language summary).
2. **Ranks** investigations by a transparent safety-risk score
   (flammability · hidden hazard · exploration relevance · data richness).
3. **Interprets** the corpus into actionable fire-safety insights
   (detection gaps, material limits, exploration atmospheres, partial-g needs).

## Judging lens (Space Apps)

- Relevance & usefulness to the challenge statement
- Working demo quality (data must be real where claimed)
- Clarity of the AI/SI component and how it turns data into insight
- Team presentation / pitch
