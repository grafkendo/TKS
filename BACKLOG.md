# Tackticus backlog

Living task list. Check items off in PRs/commits; move finished work to `DEVLOG.md`.

---

## Art & assets (next up)

- [ ] **Normalize player mechs — reduce polygons** — run light / medium / heavy through Blender decimate (or similar); flatten hierarchy like medium fix; target consistent poly budget per chassis; re-export via `pack-mech-glb.mjs`.
- [ ] **Resample textures** — downscale albedo/normal maps to a shared max resolution (e.g. 512×512 or 1K); bake where needed; keep textureless in-game path as default until perf budget allows re-enabling.
- [ ] **Normalize light & heavy mechs in Blender** — same pipeline as medium (`fix-medium-mech.py` → generalize to `fix-mech.py` per chassis): origin at feet, +Y forward, unit height, no Sketchfab transform junk.
- [ ] **Ground terrain models** — replace procedural hex streets with textured ground tiles (dirt, asphalt, crosswalks).
- [ ] **Building models** — replace procedural building boxes with glTF facades or full structures (keep destructible HP rules).

## Gameplay & UX

- [ ] **Re-enable textures selectively** — optional quality tier or per-asset toggle once resampled assets exist.
- [ ] **More enemy variety** — weight Straznik / tank / spider spawn mix; tune per-map.
- [ ] **BGA Studio upload** — wire PHP layer to shared rules engine when developer account approved.

## Infra

- [ ] **Co-op server hardening** — reconnect, idle timeout, room cleanup on GCP.

---

## Done (see DEVLOG.md for detail)

- Four-quadrant map with cross roads, capture-win, destructible walls, rough terrain.
- Map selection (host picks); squad screen map preview.
- Co-op invite flow (room codes, WebSocket server, GCP deploy).
- Enemy glTFs: Straznik, Atreides tank, spider drone.
- Player glTFs: light, medium, heavy (textureless miniature look).
- Mech pick preview cards (rotating 3D).
- glTF import normalization (`gltfNormalize.ts`); medium Blender fix script.
- Debug map for mech/layout testing.
- Projectile FX, missiles, terrain hover tooltips, turn animations.
- Crate pickups, textured buildings (procedural).
