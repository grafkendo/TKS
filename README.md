# Tackticus

> A small, sharp 2-player tactical abstract.
> Move one piece per turn. Flank an enemy between two of yours to capture it. First to 4 captures wins.

See **[DESIGN.md](./DESIGN.md)** for the rules and design rationale.

---

## What this repo builds

Three build targets share a **single rules engine** (`src/core/rules.ts`) so the game plays identically everywhere:

| Target | Status | Where it runs | Use it when |
|---|---|---|---|
| **Local hot-seat** | ✅ Playable now | Any modern browser | Daily dev / fast playtesting |
| **Self-host networked** | ✅ Ready | Node 20+ server | Play with a remote friend over LAN/internet |
| **Board Game Arena** | 🟡 Scaffold ready | BGA Studio (once approved) | Public release |

`src/core/rules.ts` is the source of truth. `server/core.mjs` (Node) and `modules/php/BoardManager.php` (BGA) are manual ports — Vitest tests verify the TS version, and the ports must mirror it.

---

## Quick start (5 minutes)

```powershell
cd tackticus
npm install
npm test          # run the rules-engine tests
npm run dev       # opens the hot-seat game at http://127.0.0.1:5173
```

That's it — you can play right now. Two players share the screen and take turns.

---

## Project structure

```
tackticus/
├── DESIGN.md                     # The rules. Read first.
├── README.md                     # You are here.
├── SELF_HOSTING.md               # Deploy guide for the self-host server.
│
├── src/
│   ├── core/                     # ⭐ Pure rules engine. SOURCE OF TRUTH.
│   │   ├── types.ts
│   │   ├── rules.ts
│   │   └── rules.test.ts         # Vitest — runs offline, no DB needed
│   │
│   ├── local/                    # Hot-seat client (Vite, no server)
│   │   ├── index.html
│   │   ├── main.ts
│   │   └── styles.css
│   │
│   ├── ts/                       # BGA client (built with rollup)
│   │   ├── Game.ts
│   │   ├── types.d.ts
│   │   └── States/PlayerTurn.ts
│   │
│   └── scss/                     # BGA stylesheet (compiled to tackticus.css)
│       └── tackticus.scss
│
├── server/                       # Optional self-host server (Node + ws)
│   ├── index.mjs                 # HTTP static + WebSocket rooms
│   └── core.mjs                  # JS mirror of src/core/rules.ts
│
├── img/                          # Sprites & box art
│
├── modules/                      # BGA-deployed files (PHP + built JS)
│   ├── php/
│   │   ├── Game.php
│   │   ├── BoardManager.php      # PHP port — mirrors src/core/rules.ts
│   │   └── States/
│   │       ├── PlayerTurn.php
│   │       └── NextPlayer.php
│   └── js/                       # Built JS — do not edit by hand
│
├── gameinfos.jsonc               # BGA configs
├── gamestates.jsonc
├── stats.jsonc
├── gameoptions.jsonc
├── gamepreferences.jsonc
├── dbmodel.sql
│
├── package.json
├── tsconfig.json
├── vite.config.ts                # Local + tests
└── rollup.config.mjs             # BGA TS bundle
```

---

## npm scripts

### Local & tests (no BGA needed)

```powershell
npm run dev               # Vite dev server (hot reload). Opens browser.
npm run build:local       # Production build → dist/local/
npm run preview:local     # Serve the production build locally to check it
npm test                  # Run all unit tests once
npm run test:watch        # Re-run tests on save
```

### Self-host server (networked play)

```powershell
npm run build:local       # First, build the static client
npm run server            # Then serve it on http://0.0.0.0:8080
npm run share             # Build + serve + public tunnel for a remote friend
npm run share:lan         # Same, but LAN URLs only (no tunnel)
```

See **[SELF_HOSTING.md](./SELF_HOSTING.md)** for full deploy options (LAN, VPS, Docker).

### BGA build

```powershell
npm run build:bga         # Builds modules/js/Game.js + tackticus.css
npm run watch:bga         # Watch mode (for dev with SFTP autosync)
```

---

## How the three targets relate

```
                ┌─────────────────────┐
                │  src/core/rules.ts  │  (canonical TypeScript engine)
                │  + rules.test.ts    │
                └─────────┬───────────┘
                          │  same code
       ┌──────────────────┼──────────────────┐
       │                  │                  │
       ▼                  ▼                  ▼
  src/local/main.ts  server/index.mjs     modules/php/
  (browser only)     (Node + WebSocket)   BoardManager.php
                     uses server/core.mjs (manual PHP port)
                     (JS mirror)
```

The TS engine is unit-tested. If the JS or PHP mirrors drift, that's a bug. The PHP file's header has a checklist for keeping it synced.

---

## Development workflow

### When working on rules

1. Modify `src/core/rules.ts`.
2. Add/update tests in `src/core/rules.test.ts`.
3. `npm test` until green.
4. Mirror the change into `server/core.mjs` (JS) and `modules/php/BoardManager.php` (PHP).
5. `npm run dev` to verify the local UI still feels right.

### When working on UI

- Local client: edit `src/local/*` and let Vite hot-reload.
- BGA client: edit `src/ts/*`, run `npm run watch:bga`, SFTP-sync to Studio.

---

## What's NOT built yet

- **Real piece artwork** — `img/` is empty. Currently using CSS-drawn circles.
- **Animations** beyond CSS transitions (no slide animation on move yet — pieces just appear at the destination on next render).
- **Sound effects.**
- **Game lobby / matchmaking UI** for the self-host server — you join a room by URL (`?room=foo`), no list of rooms.
- **AI opponent.** Could plug a simple minimax into the local client easily.

---

## Roadmap

### v0 — playable rules (mostly done)
- [x] Pure rules engine + tests
- [x] Local hot-seat client
- [x] Self-host server scaffold (Node + WebSocket)
- [x] BGA scaffold (waiting on Studio approval to deploy)

### v0.5 — polish
- [ ] Networked play UI in the local client (auto-connect to `/ws` when served by `server/index.mjs`)
- [ ] Move animations
- [ ] Piece artwork
- [ ] Mobile layout tuning

### v1 — ship
- [ ] AI opponent (minimax depth 4-5 should be plenty)
- [ ] Tutorial / onboarding screen
- [ ] Submit to BGA review

---

## License

TBD — most BGA community games use MIT.
