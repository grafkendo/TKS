// ============================================================================
// Tackticus — minimal self-host server.
//
// Serves:
//   - the built local client (dist/local/) as static files
//   - a /ws WebSocket endpoint for networked 2-player rooms
//
// State model:
//   - Anyone joining /ws?room=ROOMID joins (or creates) that room.
//   - First two connections in a room are players 1 and 2; further connections
//     are spectators.
//   - The server holds the authoritative GameState and validates every move
//     against the SAME rules engine the client uses (imported from
//     src/core/rules — we run the compiled JS to keep this server free of TS).
//
// How to run:
//   1. npm install
//   2. npm run build:local    # produces dist/local/
//   3. npm run build:coop     # produces server/coopEngine.js
//   4. npm run server         # listens on http://0.0.0.0:8080
//
// This is intentionally tiny. No persistence, no auth, no rate limiting.
// For LAN / friend-with-me-this-weekend use. Add what you need.
// ============================================================================

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { attachWs3d } from './ws3d.mjs';
//   (a) Ship a JS-compiled copy of rules.ts (e.g. via tsc --emit).
//   (b) Inline a tiny JS port here.
// We choose (a): the build:local step bundles core into dist/local/, but for
// server-side use we want a Node-loadable .js. To keep this dependency-free,
// we ship a small JS mirror right here. KEEP IN SYNC with src/core/rules.ts.
//
// (If you'd rather have one source of truth on the server too, run
//  `npx tsc --module esnext --moduleResolution bundler --outDir server/_core
//          --target es2020 src/core/types.ts src/core/rules.ts` and import
//  from server/_core instead.)

import { applyMove, newGame } from './core.mjs';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const STATIC_ROOT = resolve(__dirname, '..', 'dist', 'local');
const PORT = parseInt(process.env.PORT ?? '8080', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.mjs':  'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
};

// ---------------------------------------------------------------------------
// HTTP — static file server for dist/local
// ---------------------------------------------------------------------------

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/' || pathname === '') pathname = '/index.html';

  const target = join(STATIC_ROOT, pathname);
  if (!target.startsWith(STATIC_ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    res.writeHead(404).end('Not found.\n\nDid you run `npm run build:local`?');
    return;
  }
  const ext = extname(target).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
});

// ---------------------------------------------------------------------------
// WebSocket — rooms
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ noServer: true });
const wss3d = new WebSocketServer({ noServer: true });
attachWs3d(wss3d);

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  if (url.pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    return;
  }
  if (url.pathname === '/ws3d') {
    wss3d.handleUpgrade(req, socket, head, (ws) => wss3d.emit('connection', ws, req));
    return;
  }
  socket.destroy();
});

/**
 * Room: { state, players: [ws|null, ws|null], spectators: Set<ws> }
 */
const rooms = new Map();

function getRoom(id) {
  let r = rooms.get(id);
  if (!r) {
    r = { state: newGame([1, 2]), players: [null, null], spectators: new Set() };
    rooms.set(id, r);
  }
  return r;
}

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const ws of room.players) ws?.readyState === 1 && ws.send(data);
  for (const ws of room.spectators) ws.readyState === 1 && ws.send(data);
}

function sendState(room) {
  broadcast(room, { type: 'state', state: room.state });
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const roomId = url.searchParams.get('room') ?? 'default';
  const room = getRoom(roomId);

  // Assign role
  let role = 'spectator';
  let assignedPlayer = null;
  if (room.players[0] === null) {
    room.players[0] = ws;
    role = 'player';
    assignedPlayer = 1;
  } else if (room.players[1] === null) {
    room.players[1] = ws;
    role = 'player';
    assignedPlayer = 2;
  } else {
    room.spectators.add(ws);
  }

  ws.send(JSON.stringify({ type: 'joined', role, you: assignedPlayer, roomId }));
  sendState(room);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'move' && assignedPlayer !== null) {
      try {
        room.state = applyMove(room.state, assignedPlayer, msg.move);
        sendState(room);
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', reason: err.message ?? 'illegal move' }));
      }
    } else if (msg.type === 'new-game' && assignedPlayer !== null) {
      room.state = newGame([1, 2]);
      sendState(room);
    }
  });

  ws.on('close', () => {
    if (room.players[0] === ws) room.players[0] = null;
    if (room.players[1] === ws) room.players[1] = null;
    room.spectators.delete(ws);
    if (!room.players[0] && !room.players[1] && room.spectators.size === 0) {
      rooms.delete(roomId);
    } else {
      sendState(room);
    }
  });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
    console.error('Stop the other Tackticus server, or run on another port:');
    console.error('  PowerShell: $env:PORT=8081; npm run server');
    console.error('  (If you change PORT, update vite.config.ts proxy target to match.)');
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, HOST, () => {
  console.log(`Tackticus server running:`);
  console.log(`  HTTP  http://${HOST}:${PORT}/      (serves ${STATIC_ROOT})`);
  console.log(`  WS    ws://${HOST}:${PORT}/ws?room=<roomid>     (2D abstract)`);
  console.log(`  WS3D  ws://${HOST}:${PORT}/ws3d?room=<id>&name=<you>  (3D co-op PvE)`);
  console.log('');
  if (!existsSync(STATIC_ROOT)) {
    console.log('WARN: dist/local/ does not exist. Run `npm run build:local` first.');
  }
  const coopEngine = resolve(__dirname, 'coopEngine.js');
  if (!existsSync(coopEngine)) {
    console.log('WARN: server/coopEngine.js missing. Run `npm run build:coop` for 3D co-op.');
  }
});
