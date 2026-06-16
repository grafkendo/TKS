// ============================================================================
// Co-op session — lobby UI + bridge into main.ts gameplay.
// ============================================================================

import type { ChassisKind, CoopAction, CoopGameState, CoopServerMessage } from '../coop/types';
import { CoopNetClient } from '../net/CoopNetClient';

export interface CoopParams {
  roomId: string;
  playerName: string;
}

export interface CoopMainBridge {
  applyServerState: (state: CoopGameState) => void | Promise<void>;
  onEvents?: (events: CoopServerMessage extends { type: 'events'; events: infer E } ? E : never) => void;
  setStatus: (text: string) => void;
}

const CHASSIS_OPTIONS: ChassisKind[] = ['light', 'medium', 'heavy'];
const MAX_MECHS = 3;

let active = false;
let playerId: string | null = null;
let isHost = false;
let serverState: CoopGameState | null = null;
let client: CoopNetClient | null = null;
let bridge: CoopMainBridge | null = null;
let localMechPick: ChassisKind[] = [];

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

function chassisLabel(c: ChassisKind): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function renderMechPickButtons(): void {
  const wrap = document.getElementById('coop-mech-pick');
  const countEl = document.getElementById('coop-mech-count');
  if (!wrap) return;

  wrap.innerHTML = '';
  for (const chassis of CHASSIS_OPTIONS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'coop-mech-btn';
    btn.dataset.chassis = chassis;
    const picked = localMechPick.filter((m) => m === chassis).length;
    btn.textContent = picked > 0 ? `${chassisLabel(chassis)} ×${picked}` : chassisLabel(chassis);
    btn.classList.toggle('picked', picked > 0);
    btn.addEventListener('click', () => toggleMech(chassis));
    wrap.appendChild(btn);
  }

  if (countEl) {
    countEl.textContent = `${localMechPick.length} / ${MAX_MECHS} mechs selected`;
  }

  const readyBtn = document.getElementById('coop-ready-btn') as HTMLButtonElement | null;
  if (readyBtn) {
    readyBtn.disabled = localMechPick.length === 0;
  }
}

function toggleMech(chassis: ChassisKind): void {
  const idx = localMechPick.indexOf(chassis);
  if (idx >= 0) {
    localMechPick.splice(idx, 1);
  } else if (localMechPick.length < MAX_MECHS) {
    localMechPick.push(chassis);
  } else {
    bridge?.setStatus(`Squad capped at ${MAX_MECHS} mechs. Click a picked type to remove it.`);
    return;
  }
  renderMechPickButtons();
  client?.send({ type: 'setMechSelection', mechs: [...localMechPick] });
}

function syncLocalPickFromServer(state: CoopGameState): void {
  if (!playerId) return;
  const me = state.players.find((p) => p.id === playerId);
  if (me && me.selectedMechs.length > 0) {
    localMechPick = [...me.selectedMechs];
  }
  renderMechPickButtons();

  const readyBtn = document.getElementById('coop-ready-btn') as HTMLButtonElement | null;
  if (readyBtn && me) {
    readyBtn.textContent = me.ready ? 'Unready' : 'Ready';
    readyBtn.classList.toggle('ready', me.ready);
  }
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

  renderMechPickButtons();

  client = new CoopNetClient(params.roomId, params.playerName, {
    onMessage: (msg) => void handleServerMessage(msg),
    onOpen: () => main.setStatus(`Connected to room ${params.roomId}. Pick your mechs, then Ready.`),
    onClose: () => main.setStatus('Disconnected from co-op room.'),
  });
  client.connect();

  nameInput?.addEventListener('change', () => {
    client?.send({ type: 'setName', name: nameInput.value });
  });

  readyBtn?.addEventListener('click', () => {
    if (localMechPick.length === 0) {
      main.setStatus('Select at least one mech before readying up.');
      return;
    }
    const me = serverState?.players.find((p) => p.id === playerId);
    const nextReady = !me?.ready;
    client?.send({ type: 'setReady', ready: nextReady });
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
        ? `Joined as ${msg.role}${isHost ? ' (host)' : ''}. Pick 1–3 mechs.`
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
    if (msg.state.phase === 'lobby') {
      syncLocalPickFromServer(msg.state);
    } else {
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
    .map((p) => {
      const squad =
        p.selectedMechs.length > 0
          ? ` — ${p.selectedMechs.map(chassisLabel).join(', ')}`
          : '';
      return `<div class="coop-player">${p.name}${squad}${p.ready ? ' ✓' : ''}${p.id === state.hostPlayerId ? ' (host)' : ''}</div>`;
    })
    .join('');
}
