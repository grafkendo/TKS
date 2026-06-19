// ============================================================================
// Co-op session — lobby UI + bridge into main.ts gameplay.
// ============================================================================

import type { ChassisKind, CoopAction, CoopGameState, CoopServerMessage } from '../coop/types';
import { CoopNetClient } from '../net/CoopNetClient';
import { enqueueCoopEvents, enqueueCoopState, enqueueCoopActionResult } from './coopPlayback';
import { setupCoopInviteLink } from './coopInviteUi';
import { MECH_CARD_STATS, startMechPreview, stopAllMechPreviews } from './mechSelectPreview';
import { startMapPreview, stopActiveMapPreview, type MapPreviewHandle } from './mapSelectPreview';
import { buildCoopGameUrl, sanitizeRoomId, sanitizePlayerName } from './coopUrls';
import { MAP_OPTIONS } from '../maps/index';

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
let lobbyParams: CoopParams | null = null;
let refreshInviteUrl: (mapId?: string) => void = () => {};
let lobbyMapPickerWired = false;
let mapPreviewHandle: MapPreviewHandle | null = null;

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

let actionPending = false;

export function isCoopActionPending(): boolean {
  return actionPending;
}

export function clearCoopActionPending(): void {
  actionPending = false;
}

export function sendCoopAction(action: CoopAction): void {
  if (actionPending) return;
  actionPending = true;
  client?.send({ type: 'action', action });
}

function chassisLabel(c: ChassisKind): string {
  return c.charAt(0).toUpperCase() + c.slice(1);
}

function mapDisplayName(mapId: string): string {
  return MAP_OPTIONS.find((m) => m.id === mapId)?.name ?? mapId;
}

function syncClientMapFromServer(state: CoopGameState): void {
  if (!lobbyParams || state.phase !== 'lobby') return;
  if (state.mapId === lobbyParams.mapId) return;
  const url = buildCoopGameUrl({
    room: lobbyParams.roomId,
    name: lobbyParams.playerName,
    map: state.mapId,
  });
  window.location.replace(url);
}

function ensureMapPreview(mapId: string): void {
  const canvas = document.getElementById('coop-map-preview') as HTMLCanvasElement | null;
  const enemyCards = document.getElementById('coop-map-enemy-cards');
  if (!canvas) return;
  if (!mapPreviewHandle) {
    mapPreviewHandle = startMapPreview(mapId, canvas, enemyCards);
  } else {
    mapPreviewHandle.setMap(mapId);
  }
}

function stopLobbyPreviews(): void {
  stopActiveMapPreview();
  mapPreviewHandle = null;
  stopAllMechPreviews();
}

function renderLobbyMapPicker(state: CoopGameState): void {
  const hostWrap = document.getElementById('coop-host-map-picker') as HTMLDivElement | null;
  const guestLabel = document.getElementById('coop-map-label') as HTMLParagraphElement | null;
  if (guestLabel) {
    guestLabel.textContent = `Battlefield: ${mapDisplayName(state.mapId)} (chosen by host)`;
  }
  if (!hostWrap) return;

  if (!isHost) {
    hostWrap.hidden = true;
    return;
  }

  hostWrap.hidden = false;
  if (!lobbyMapPickerWired) {
    hostWrap.innerHTML = '';
    for (const opt of MAP_OPTIONS) {
      const label = document.createElement('label');
      label.className = 'coop-map-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'coop-lobby-map';
      input.value = opt.id;

      const body = document.createElement('span');
      body.innerHTML = `<strong>${opt.name}</strong><span>${opt.description}</span>`;

      input.addEventListener('change', () => {
        if (input.checked) client?.send({ type: 'setMap', mapId: opt.id });
      });

      label.append(input, body);
      hostWrap.appendChild(label);
    }
    lobbyMapPickerWired = true;
  }

  for (const input of hostWrap.querySelectorAll<HTMLInputElement>('input[name="coop-lobby-map"]')) {
    input.checked = input.value === state.mapId;
  }

  ensureMapPreview(state.mapId);
}

function renderMechPickButtons(): void {
  const wrap = document.getElementById('coop-mech-pick');
  const countEl = document.getElementById('coop-mech-count');
  if (!wrap) return;

  const existingCards = wrap.querySelectorAll<HTMLButtonElement>('.coop-mech-card');
  const needsBuild =
    existingCards.length !== CHASSIS_OPTIONS.length ||
    CHASSIS_OPTIONS.some((chassis) => !wrap.querySelector(`[data-chassis="${chassis}"]`));

  if (needsBuild) {
    wrap.innerHTML = '';
    stopAllMechPreviews();

    for (const chassis of CHASSIS_OPTIONS) {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'coop-mech-card';
      card.dataset.chassis = chassis;

      const canvas = document.createElement('canvas');
      canvas.className = 'coop-mech-preview';
      canvas.width = 140;
      canvas.height = 100;
      startMechPreview(chassis, canvas);

      const title = document.createElement('span');
      title.className = 'coop-mech-card-title';

      const stats = document.createElement('span');
      stats.className = 'coop-mech-card-stats';
      stats.textContent = MECH_CARD_STATS[chassis];

      card.append(canvas, title, stats);
      card.addEventListener('click', () => toggleMech(chassis));
      wrap.appendChild(card);
    }
  }

  for (const chassis of CHASSIS_OPTIONS) {
    const card = wrap.querySelector<HTMLButtonElement>(`[data-chassis="${chassis}"]`);
    if (!card) continue;
    const picked = localMechPick.filter((m) => m === chassis).length;
    card.classList.toggle('picked', picked > 0);
    const title = card.querySelector('.coop-mech-card-title');
    if (title) {
      title.textContent = picked > 0 ? `${chassisLabel(chassis)} ×${picked}` : chassisLabel(chassis);
    }
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
  lobbyParams = params;

  const lobbyEl = document.getElementById('coop-lobby') as HTMLDivElement | null;
  const nameInput = document.getElementById('coop-name') as HTMLInputElement | null;
  const readyBtn = document.getElementById('coop-ready-btn') as HTMLButtonElement | null;
  const startBtn = document.getElementById('coop-start-btn') as HTMLButtonElement | null;
  const roomLabel = document.getElementById('coop-room-label') as HTMLSpanElement | null;

  if (roomLabel) roomLabel.textContent = params.roomId;
  if (nameInput) nameInput.value = params.playerName;
  if (lobbyEl) lobbyEl.hidden = false;

  ({ refreshInviteUrl } = setupCoopInviteLink(params.roomId, main.setStatus));
  refreshInviteUrl(params.mapId);
  renderMechPickButtons();
  ensureMapPreview(params.mapId);

  const urlMap = new URLSearchParams(window.location.search).get('map');
  client = new CoopNetClient(
    params.roomId,
    params.playerName,
    urlMap ?? undefined,
    {
      onMessage: (msg) => void handleServerMessage(msg),
      onOpen: () => main.setStatus(`Connected to room ${params.roomId}. Pick your mechs, then Ready.`),
      onClose: () => main.setStatus('Disconnected from co-op room.'),
    },
  );
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
    clearCoopActionPending();
    bridge.setStatus(msg.reason);
    return;
  }

  if (msg.type === 'actionResult') {
    serverState = msg.state;
    for (const ev of msg.events) {
      if (ev.kind === 'message') bridge.setStatus(ev.text);
    }
    if (msg.state.phase === 'lobby') {
      syncClientMapFromServer(msg.state);
      updateLobby(msg.state);
      refreshInviteUrl(msg.state.mapId);
      syncLocalPickFromServer(msg.state);
    } else {
      const lobbyEl = document.getElementById('coop-lobby') as HTMLDivElement | null;
      if (lobbyEl) lobbyEl.hidden = true;
      stopLobbyPreviews();
      enqueueCoopActionResult(msg.events, msg.state);
    }
    return;
  }

  if (msg.type === 'state') {
    serverState = msg.state;
    if (msg.state.phase === 'lobby') {
      syncClientMapFromServer(msg.state);
      updateLobby(msg.state);
      refreshInviteUrl(msg.state.mapId);
      syncLocalPickFromServer(msg.state);
    } else {
      const lobbyEl = document.getElementById('coop-lobby') as HTMLDivElement | null;
      if (lobbyEl) lobbyEl.hidden = true;
      stopLobbyPreviews();
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
  if (state.phase !== 'lobby') return;
  renderLobbyMapPicker(state);
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
