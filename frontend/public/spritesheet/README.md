# Hangar sprite atlases

Source sprite sheets and PixiJS metadata for the IGNIS hangar. Runtime copies live in `flame-challenge/frontend/public/spritesheet/` and can be refreshed with `design/scripts/sync-runtime-assets.sh`.

## Files

- `ignis_hangar_spritesheet.jpg`: original 1024×1024 atlas containing beacon and forcefield frames, the exploration ship, crew poses, and modular floor/border tiles. The runtime hangar copy is named `spritesheet.jpg`.
- `spritesheet_spec.json`: original atlas description and animation groups.
- `ignis_hangar_assets_v1.png` and `ignis_hangar_assets_v1.json`: transparent 1536×1024 atlas with cargo containers, the shuttle, technician poses, starfield tiles, and beacon frames.
- `ignis_hangar_spritesheet_v2.png` and `ignis_hangar_spritesheet_v2.json`: transparent 1536×1024 reorganized atlas with beacon, forcefield, shuttle, crew, and floor/border assets.

The JSON files use PixiJS spritesheet structure: `frames` maps names to pixel rectangles and `animations` lists the frame names in playback order. Load each JSON with the PNG named in its `meta.image` field. Static takes are catalogued separately in `design/guias/animacoes/TAKES_HANGAR.md`.
