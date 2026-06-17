// ============================================================================
// Co-op session — lobby UI + bridge into main.ts gameplay.
// ============================================================================

import type { ChassisKind, CoopAction, CoopGameState, CoopServerMessage } from '../coop/types';
import { CoopNetClient } from '../net/CoopNetClient';
import { enqueueCoopEvents, enqueueCoopState } from './coopPlayback';
import { setupCoopInviteLink } from './coopInviteUi';
import { MECH_CARD_STATS, renderMechPreview } from './mechSelectPreview';
import { sanitizeRoomId, sanitizePlayerName } from './coopUrls';

export interface CoopParams {
  roomId: string;
  playerName: string;
  mapId: string;
}

export interface CoopMainBridge {
  applyServerState: (state: CoopGameState) => void;
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
  const roomId = sanitizeRoomId(params.get('room') ?? 'squad');
  const playerName = sanitizePlayerName(params.get('name') ?? 'Guest');
  const mapId = (params.get('map') ?? 'quadrants').slice(0, 32);
  return { roomId, playerName, mapId };
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
    const picked = localMechPick.filter((m) => m === chassis).length;

    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'coop-mech-card';
    card.dataset.chassis = chassis;
    card.classList.toggle('picked', picked > 0);

    const canvas = document.createElement('canvas');
    canvas.className = 'coop-mech-preview';
    canvas.width = 140;
    canvas.height = 100;
    void renderMechPreview(chassis, canvas);

    const title = document.createElement('span');
    title.className = 'coop-mech-card-title';
    title.textContent = picked > 0 ? `${chassisLabel(chassis)} ×${picked}` : chassisLabel(chassis);

    const stats = document.createElement('span');
    stats.className = 'coop-mech-card-stats';
    stats.textContent = MECH_CARD_STATS[chassis];

    card.append(canvas, title, stats);
    card.addEventListener('click', () => toggleMech(chassis));
    wrap.appendChild(card);
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

  setupCoopInviteLink(params.roomId, main.setStatus);
  renderMechPickButtons();

  client = new CoopNetClient(params.roomId, params.playerName, params.mapId, {
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
      enqueueCoopState(msg.state);
    }
    return;
  }

  if (msg.type === 'events') {
    bridge.onEvents?.(msg.events);
    for (const ev of msg.events) {
      if (ev.kind === 'message') bridge.setStatus(ev.text);
    }
    return;
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
