# IGNIS hangar sprite sheets

This folder is inside Vite’s `frontend/public` directory, so its files are served from `/spritesheet/` and copied into the production build. It contains the original reference atlas and two PNG atlases with PixiJS-compatible JSON metadata.

- `ignis_hangar_spritesheet.jpg`: original 1024×1024 source atlas.
- `ignis_hangar_assets_v1.png` + `.json`: transparent atlas with containers, science shuttle, technician poses, starfield tiles and beacon frames.
- `ignis_hangar_spritesheet_v2.png` + `.json`: reorganized transparent atlas for hangar beacons, forcefield, shuttle, crew poses and modular tiles.
- `spritesheet_spec.json`: specification for the original source atlas.

The JSON files use PixiJS spritesheet fields: `frames` map names to atlas rectangles and `animations` list frame names in playback order. Load the matching PNG and JSON together. Animation playback speed can be configured by the consuming scene.

The V1 and V2 atlases are separate revisions. V2 preserves the sprite families in the original reference; V1 adds the cargo and starfield assets.
