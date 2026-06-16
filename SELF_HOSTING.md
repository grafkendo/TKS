# Self-hosting Tackticus

Three escalating options, from "just open the file" to "production deploy".

---

## Quick share with a friend (no cloud)

One command builds the game, starts a local server, and (by default) opens a **free public tunnel** so a remote friend can open it in their browser. No Google Cloud, no ngrok account.

```powershell
cd tackticus
npm install
npm run share
```

Leave the terminal open. You'll see:

- **localhost** — for you on this PC
- **LAN** (`http://192.168.x.x:8080/...`) — friend on the same Wi‑Fi
- **Internet** (`https://….loca.lt/...`) — send this to a remote friend

Direct link to the 3D demo: append `/3d/index.html` to any of those URLs.

**LAN only** (no public tunnel):

```powershell
npm run share:lan
```

**Port already in use?**

```powershell
$env:PORT='8081'; npm run share
```

Each person plays their **own solo game** (vs AI). Playing the same match together online is not wired yet.

The tunnel may show a one-time “Click to continue” page — your friend clicks through, then the game loads.

---

## Option 1 — Pure static (no server)

The local hot-seat client doesn't need a backend at all. Both players share one screen.

```powershell
npm install
npm run build:local
```

Now `dist/local/` contains a complete static site: `index.html`, bundled JS, and CSS. Host it anywhere:

- **GitHub Pages / Cloudflare Pages / Netlify / Vercel** — push `dist/local/` and you're done.
- **Your own web server** (nginx, Apache, Caddy) — point the document root at `dist/local/`.
- **No server at all** — open `dist/local/index.html` directly with `file://` in a browser (works fully).

**Pros:** zero infrastructure, zero attack surface, free hosting tier on basically any platform.
**Cons:** two players must share one device or one screen.

---

## Option 2 — Node server for networked play

If you want two players on different computers to play the same game, run the built-in WebSocket server.

```powershell
npm install
npm run build:local       # build the static client first
npm run server            # starts HTTP + WebSocket on 0.0.0.0:8080
```

Open `http://localhost:8080/` in two browsers (or send the URL to a friend on your LAN).

### How rooms work

- Connect to `/ws?room=anything` — first connection becomes Red, second becomes Blue, rest are spectators.
- If you don't pass `?room=` you'll join the `default` room.
- Reload-safe: state is held in server memory until the room empties.

### Customising

Set environment variables before `npm run server`:

```powershell
$env:PORT = '3000'        # default 8080
$env:HOST = '127.0.0.1'   # default 0.0.0.0 (any interface)
npm run server
```

> ⚠️ This server has **no auth, no rate limiting, no persistence**. Fine for LAN play or sharing with friends. Don't put it on the public internet without adding those.

---

## Option 3 — Docker / Cloud Run / VPS deploy

The repo includes a **`Dockerfile`** at the project root (Node 20 — **not** PHP/Apache). Use it for Cloud Run, any Docker host, or a VPS.

### Build and run locally

```bash
docker build -t tackticus .
docker run -d -p 8080:8080 --name tackticus tackticus
```

Open `http://localhost:8080/3d/index.html`.

### Google Cloud Run

From the project root (with [gcloud](https://cloud.google.com/sdk) installed and a project selected):

```bash
gcloud run deploy tackticus \
  --source . \
  --region us-central1 \
  --allow-unauthenticated \
  --session-affinity
```

- Cloud Run injects `PORT` automatically — the server already reads it.
- **`--session-affinity`** keeps WebSocket room state on one instance (rooms are in memory).
- Enable **WebSocket** on the service if you use `/ws` later.

**Do not use** PHP/Apache/MySQL templates from Cloud Assist — this project has no database and no PHP runtime for self-host.

### Dockerfile (already in repo)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build:local
ENV HOST=0.0.0.0
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server/index.mjs"]
```

### Behind a reverse proxy (nginx / Caddy)

Make sure the proxy forwards the WebSocket `Upgrade` header. Example Caddyfile:

```caddy
tackticus.example.com {
  reverse_proxy localhost:8080
}
```

(Caddy handles WebSocket upgrades automatically.)

Nginx version:

```nginx
server {
  listen 443 ssl;
  server_name tackticus.example.com;

  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
  }
}
```

---

## Option 4 — fly.io / Railway / Render

The `server/index.mjs` is a plain Node app that listens on `process.env.PORT`. Any "Node app" PaaS works:

- **fly.io**: `fly launch` and accept defaults; it'll detect Node + write a `fly.toml`. Set the internal port to 8080.
- **Railway / Render**: connect the repo, set the start command to `node server/index.mjs`, and add a build command of `npm run build:local`.

Free tier is usually plenty for a 2-player turn-based game with kilobytes of state.

---

## What about saving games / accounts?

Not built. The server keeps everything in memory. If you want persistence:

1. Pick a tiny store — SQLite, Redis, or just JSON files on disk.
2. Add `loadRoom(id)` / `saveRoom(id, state)` calls around the WebSocket message handlers in `server/index.mjs`.
3. The `GameState` is plain JSON-serialisable — no special encoding needed.

That's a 50-line addition tops. Open an issue (or a TODO in the code) when you actually need it.

---

## Adding networked play to the local client

Right now `src/local/main.ts` is fully client-side (hot-seat). To make it talk to the WebSocket server, you'd:

1. On load, if `window.location.protocol` matches the page being served by `server/index.mjs`, open a `WebSocket` to `/ws?room=<room from URL>`.
2. Replace direct `applyMove` calls with `ws.send({ type: 'move', move })`.
3. Replace the local `state` with whatever the server sends back via `{ type: 'state', state }`.

Roughly 40-60 lines. Skipped here because the current local client is more useful for solo rules-testing — but the server is already ready to accept connections, so adding it is a small, contained job.
