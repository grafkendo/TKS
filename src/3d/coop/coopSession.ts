// ============================================================================
// Co-op session — lobby UI + bridge into main.ts gameplay.
// ============================================================================

import type { CoopAction, CoopGameState, CoopServerMessage } from '../coop/types';
import { CoopNetClient } from '../net/CoopNetClient';

export interface CoopParams {
  roomId: string;
  playerName: string;
}

export interface CoopMainBridge {
  /** Apply authoritative server snapshot to the 3D scene. */
  applyServerState: (state: CoopGameState) => void | Promise<void>;
  /** Play cosmetic events (optional). */
  onEvents?: (events: CoopServerMessage extends { type: 'events'; events: infer E } ? E : never) => void;
  setStatus: (text: string) => void;
}

let active = false;
let playerId: string | null = null;
let isHost = false;
let serverState: CoopGameState | null = null;
let client: CoopNetClient | null = null;
let bridge: CoopMainBridge | null = null;

export function parseCoopParams(): CoopParams | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get('coop') !== '1') return null;
  const roomId = (params.get('room') ?? 'squad').slice(0, 32);
  const playerName = (params.get('name') ?? 'Guest').slice(0, 24);
  return { roomId, playerName };
}

export function isCoopActive(): boolean {
  return active;
}

export function coopPlayerId(): string | null {
  return playerId;
}

export function coopServerState(): CoopGameState | null {
  return serverState;
}

export function canControlUnit(unitId: string): boolean {
  if (!active || !serverState || !playerId) return false;
  if (serverState.phase !== 'human') return false;
  if (serverState.activePlayerId !== playerId) return false;
  const u = serverState.units.find((x) => x.id === unitId);
  return !!u && u.ownerId === playerId && !u.destroyed;
}

export function sendCoopAction(action: CoopAction): void {
  client?.send({ type: 'action', action });
}

export function initCoopSession(params: CoopParams, main: CoopMainBridge): void {
  active = true;
  bridge = main;

  const lobbyEl = document.getElementById('coop-lobby') as HTMLDivElement | null;
  const nameInput = document.getElementById('coop-name') as HTMLInputElement | null;
  const readyBtn = document.getElementById('coop-ready-btn') as HTMLButtonElement | null;
  const startBtn = document.getElementById('coop-start-btn') as HTMLButtonElement | null;
  const roomLabel = document.getElementById('coop-room-label') as HTMLSpanElement | null;

  if (roomLabel) roomLabel.textContent = params.roomId;
  if (nameInput) nameInput.value = params.playerName;
  if (lobbyEl) lobbyEl.hidden = false;

  client = new CoopNetClient(params.roomId, params.playerName, {
    onMessage: (msg) => void handleServerMessage(msg),
    onOpen: () => main.setStatus(`Connected to room ${params.roomId}.`),
    onClose: () => main.setStatus('Disconnected from co-op room.'),
  });
  client.connect();

  nameInput?.addEventListener('change', () => {
    client?.send({ type: 'setName', name: nameInput.value });
  });

  let ready = false;
  readyBtn?.addEventListener('click', () => {
    ready = !ready;
    readyBtn.textContent = ready ? 'Unready' : 'Ready';
    readyBtn.classList.toggle('ready', ready);
    client?.send({ type: 'setReady', ready });
  });

  startBtn?.addEventListener('click', () => {
    client?.send({ type: 'startGame' });
  });
}

async function handleServerMessage(msg: CoopServerMessage): Promise<void> {
  if (!bridge) return;

  if (msg.type === 'joined') {
    playerId = msg.playerId;
    isHost = msg.isHost;
    const startBtn = document.getElementById('coop-start-btn') as HTMLButtonElement | null;
    if (startBtn) startBtn.hidden = !isHost;
    bridge.setStatus(
      msg.role === 'player'
        ? `Joined as ${msg.role}${isHost ? ' (host)' : ''}.`
        : 'Spectating.',
    );
    return;
  }

  if (msg.type === 'error') {
    bridge.setStatus(msg.reason);
    return;
  }

  if (msg.type === 'state') {
    serverState = msg.state;
    updateLobby(msg.state);
    if (msg.state.phase !== 'lobby') {
      const lobbyEl = document.getElementById('coop-lobby') as HTMLDivElement | null;
      if (lobbyEl) lobbyEl.hidden = true;
      await bridge.applyServerState(msg.state);
    }
    return;
  }

  if (msg.type === 'events') {
    bridge.onEvents?.(msg.events);
    for (const ev of msg.events) {
      if (ev.kind === 'message') bridge.setStatus(ev.text);
    }
  }
}

function updateLobby(state: CoopGameState): void {
  const roster = document.getElementById('coop-roster') as HTMLDivElement | null;
  if (!roster) return;
  roster.innerHTML = state.players
    .map(
      (p) =>
        `<div class="coop-player">${p.name}${p.ready ? ' ✓' : ''}${p.id === state.hostPlayerId ? ' (host)' : ''}</div>`,
    )
    .join('');
}
