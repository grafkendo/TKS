# Tackticus dev log

Chronological record of what shipped. Newest entries at the top.

---

## 2026-06-17 — Medium mech Blender normalization

- Ran `tools/scripts/fix-medium-mech.py` in Blender: flatten Sketchfab hierarchy, upright, feet on ground, unit height.
- Rebuilt `public/assets/mechs/medium.glb` via `pack-mech-glb.mjs` (textureless).
- Removed runtime `groundYOffset` hack from `mechAssets.ts`.
- Added `npm run fix:mech:medium` script.

## 2026-06-17 — Debug map & mech size normalization

- Added flat debug map (`?map=debug`) with player and enemy mechs lined up for inspection.
- Introduced `gltfNormalize.ts` — shared upright / scale-to-height / foot-grounding for game and lobby previews.
- Tuned `PLAYER_CHASSIS_HEIGHT` and `ENEMY_CHASSIS_HEIGHT` tables in `mechAssets.ts`.
- Fixed medium mech grounding; scaled light/medium/heavy to consistent in-game sizes.
- Scaled enemy tank (Atreides) down; adjusted Straznik size.

## 2026-06-16 — Player mech glTF models (textureless)

- Added **light** mech (w82yuu Mecha, CC-BY-4.0) — `light.glb`, no textures.
- Added **medium** mech (leoxx300, CC-BY-4.0) — `medium.glb`, no textures.
- **Heavy** mech already in place (W9231 Combat Mech).
- `pack-mech-glb.mjs` strips textures at build time for performance.
- Mech selection cards show rotating untextured models.

## 2026-06-16 — Miniature look & lighting

- Swapped high-res mech textures for flat team-tinted materials (miniature/tabletop feel).
- Greyscale terrain palette.
- Added spotlight-style lighting on selected units and moving enemies.

## 2026-06-16 — Map selection & squad screen

- Host picks map on the start screen (Battlefield, Urban, Quadrants, Debug).
- Map preview card on squad screen (rotating 3D preview).
- Heavy mech card preview scaled to fit.

## 2026-06-16 — Combat & terrain polish

- Thicker, faster glowing projectiles.
- Long-range missile weapon.
- Rough terrain tiles with type shown on hover.
- Enemies no longer spawn on walls.
- Fixed enemy bot orientation (were lying flat — shadow only visible).

## 2026-06-16 — Four-quadrant map & win condition

- New quadrant map: 3-hex-wide cross roads, destructible walls, objective points per quadrant.
- Win by capturing all four objectives.
- More pickups; dead enemies removed from board.
- Fewer buildings on demo map; camera framed to map width.
- Enemy units enlarged; player mechs slightly reduced.
- Mech pick preview cards with 3D model per chassis.

## 2026-06-16 — Enemy glTF assets

- **Straznik** (Iron Harvest) for bot enemies — `straznik.glb`.
- **Atreides Combat Tank** as alternate tank enemy — `atreides.glb`.
- **Spider drone** enemy with generated texture.
- Enemy bots scaled ~2× for readability.

## 2026-06-16 — Co-op multiplayer

- WebSocket co-op server (`server/ws3d.mjs`, `coopEngine.js`).
- Room codes, host/guest flow, invite links.
- Fixed room-join redirect bug.
- Turn animations play for AI and human moves (projectiles, effects visible).
- Host selects map; syncs to guests.

## 2026-06-16 — GCP deployment

- Deployed co-op server to Google Cloud Run.
- Documented self-hosting in `SELF_HOSTING.md`.

## 2026-06-15 — Pickups, crates & buildings

- Ammo/health crate pickups on textured cube geometry.
- Procedural textured buildings.
- Spider drone enemy meshes.
- Debug logging for turn-hang investigation.

## 2026-06-15 — 3D mech tactics prototype

- Three.js + Vite multi-page setup (`src/3d/`, `src/local/`).
- Procedural low-poly mechs from primitives (`PrimitiveMech.ts`).
- `MechAsset` interface + registry — swappable for glTF later (`GltfMech.ts`).
- Isometric camera, hex grid, turn-based demo loop.
- Effects system stub (`src/3d/fx/`).

## 2026-06-15 — Local-first game scaffold

- Pure TypeScript rules engine (`src/core/rules.ts`) — presentation-agnostic.
- 2D hot-seat client for rules testing (`src/local/`).
- BGA Studio file layout preserved for future upload (`gameinfos.jsonc`, PHP stubs).
- `DESIGN.md` v0 design doc (6×6 abstract tactics — since evolved to mech tactics).

## 2026-06-15 — Project kickoff

- Created **Tackticus** as a 10% work project.
- Initial goal: Board Game Arena integration; pivoted to local + self-hosted when Studio approval pending.
