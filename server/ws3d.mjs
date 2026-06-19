// ============================================================================
// WebSocket handler — 3D co-op PvE rooms (/ws3d).
// ============================================================================

import { randomUUID } from 'node:crypto';
import {
  createLobby,
  addPlayer,
  setPlayerName,
  setPlayerMechs,
  setPlayerReady,
  setLobbyMap,
  startGame,
  applyAction,
  runAiPhase,
} from './coopEngine.js';

/**
 * @typedef {object} RoomClient
 * @property {import('ws').WebSocket} ws
 * @property {string} playerId
 * @property {'player'|'spectator'} role
 */

/** @type {Map<string, { state: object, clients: RoomClient[], hostPlayerId: string }>} */
const rooms = new Map();

function broadcast(room, msg) {
  const data = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c.ws.readyState === 1) c.ws.send(data);
  }
}

function broadcastActionResult(room, events, state) {
  room.state = state;
  broadcast(room, { type: 'actionResult', events, state });
}

function sendState(room) {
  broadcast(room, { type: 'state', state: room.state });
}

export function attachWs3d(wss) {
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
    const roomId = (url.searchParams.get('room') ?? 'default').slice(0, 32);
    const name = (url.searchParams.get('name') ?? 'Guest').slice(0, 24);
    const mapId = (url.searchParams.get('map') ?? 'quadrants').slice(0, 32);

    let room = rooms.get(roomId);
    let playerId = randomUUID();
    let role = 'spectator';

    if (!room) {
      const host = { id: playerId, name, slot: 0, ready: false, selectedMechs: [] };
      room = {
        state: createLobby(roomId, host, mapId),
        clients: [],
        hostPlayerId: playerId,
      };
      rooms.set(roomId, room);
      role = 'player';
    } else if (room.state.players.length < 2) {
      const newcomer = {
        id: playerId,
        name,
        slot: room.state.players.length,
        ready: false,
        selectedMechs: [],
      };
      room.state = addPlayer(room.state, newcomer);
      role = 'player';
    }

    if (role === 'player') {
      room.state = setPlayerName(room.state, playerId, name);
    }

    const client = { ws, playerId, role };
    room.clients.push(client);

    ws.send(JSON.stringify({
      type: 'joined',
      roomId,
      playerId,
      role,
      isHost: playerId === room.hostPlayerId,
    }));
    sendState(room);

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      try {
        if (msg.type === 'setName' && role === 'player') {
          room.state = setPlayerName(room.state, playerId, msg.name);
          sendState(room);
        } else if (msg.type === 'setMechSelection' && role === 'player') {
          room.state = setPlayerMechs(room.state, playerId, msg.mechs);
          sendState(room);
        } else if (msg.type === 'setReady' && role === 'player') {
          room.state = setPlayerReady(room.state, playerId, !!msg.ready);
          sendState(room);
        } else if (msg.type === 'setMap' && role === 'player') {
          room.state = setLobbyMap(room.state, playerId, msg.mapId);
          sendState(room);
        } else if (msg.type === 'startGame') {
          if (playerId !== room.hostPlayerId) throw new Error('Only host can start.');
          const res = startGame(room.state);
          broadcastActionResult(room, res.events, res.state);
        } else if (msg.type === 'action' && role === 'player') {
          const res = applyAction(room.state, playerId, msg.action);
          broadcastActionResult(room, res.events, res.state);
          if (room.state.phase === 'ai' && !room.state.outcome.ended) {
            const ai = runAiPhase(room.state);
            broadcastActionResult(room, ai.events, ai.state);
          }
        }
      } catch (err) {
        ws.send(JSON.stringify({
          type: 'error',
          reason: err?.message ?? 'Request failed',
        }));
      }
    });

    ws.on('close', () => {
      room.clients = room.clients.filter((c) => c.ws !== ws);
      if (room.clients.length === 0) {
        rooms.delete(roomId);
      }
    });
  });
}
