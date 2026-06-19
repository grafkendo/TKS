# Mech glTF assets (Blender → Tackticus)

Drop exported `.glb` files here. The game auto-loads them by chassis name.

| File | Used for |
|------|----------|
| `light.glb` | Light chassis (w82yuu Mecha — CC-BY-4.0, see `light_license.txt`) |
| `medium.glb` | Medium chassis (leoxx300 mech model — CC-BY-4.0, see `medium_license.txt`) |
| `heavy.glb` | Heavy chassis (W9231 Combat Mech — CC-BY-4.0, see `w9231_license.txt`) |
| `straznik.glb` | Enemy bots — Iron Harvest Straznik (CC-BY-4.0, see `straznik_license.txt`) |
| `cbp0.glb` … `cbp5.glb` | Enemy archetypes — CBP 10 LP pack |

If a file is missing, that chassis keeps the procedural placeholder mech.

---

## Blender export checklist

### 1. Scale & orientation

- Model the mech standing upright, **facing +Y forward** in Blender (maps to game +Z after export).
- Target height: **~1.6 m** in Blender units (1 unit = 1 meter works well).
- Origin at **ground center between feet**.

### 2. Empty objects (attach points)

Add empties parented to the rig/mesh. Names are matched case-insensitively:

| Empty name | Purpose |
|------------|---------|
| `rightHand` | Muzzle flash, beam origin |
| `leftHand` | Left weapon (optional) |
| `torso` | Hit impact FX |
| `head` | Cockpit target (optional) |
| `rootGround` | Dust/smoke at feet |
| `shoulderR` / `shoulderL` | Heavy shoulder weapons (optional) |

### 3. Materials (team colors)

Name materials so the game can tint red vs blue team:

| Material name contains | Tinted with |
|------------------------|-------------|
| `TeamPrimary` or `Primary` or `Armor` | Team primary color |
| `TeamSecondary` or `Secondary` | Team secondary |
| `TeamAccent` or `Accent` | Team accent |

Leave glass/weapon materials unnamed or without those keywords to keep authored colors.

### 4. Animations (optional)

Name actions in the glTF export:

| Action name | When played |
|-------------|-------------|
| `idle` | Standing |
| `walk` | Moving |
| `fire` | Shooting |
| `hit` | Taking damage |
| `destroyed` | Wrecked |

No animations? The model still works — it just won't play clips.

### 5. Export settings (glTF 2.0)

**File → Export → glTF 2.0 (.glb)**

- Format: **glTF Binary (.glb)**
- Include: **Selected Objects** or full mech collection
- **+Y Up** (default)
- Apply Modifiers: on
- UVs, Normals, Materials: on
- Skinning / Shape Keys: on if rigged

Export to this folder as `light.glb`, `medium.glb`, or `heavy.glb`.

### 6. Test in game

```bash
npm run dev
```

Open `http://127.0.0.1:5173/3d/index.html` — mechs with a matching `.glb` use your model.

Check the browser console: if load fails you'll see a fallback warning and procedural mechs appear instead.

---

## Quick first test

1. Model a simple mech (or duplicate and scale the default cube rig).
2. Add an empty named `rightHand` at the gun tip.
3. Export as `light.glb` into this folder.
4. Refresh the game — red light mechs should show your mesh.
