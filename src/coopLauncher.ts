// ============================================================================
// Main menu — map pick, co-op rooms, solo launch.
// ============================================================================

import {
  buildCoopGameUrl,
  COOP_GAME_PATH,
  generateRoomCode,
  parseRoomCodeInput,
  sanitizePlayerName,
} from './3d/coop/coopUrls';
import { MAP_OPTIONS } from './3d/maps/index';

const MAP_STORAGE_KEY = 'tackticus.map';

function selectedMapId(): string {
  const checked = document.querySelector<HTMLInputElement>('input[name="map"]:checked');
  if (checked?.value) return checked.value;
  return localStorage.getItem(MAP_STORAGE_KEY) ?? 'quadrants';
}

function persistMapChoice(id: string): void {
  try {
    localStorage.setItem(MAP_STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

function buildSoloGameUrl(mapId: string): string {
  const origin = new URL(window.location.href).origin;
  const url = new URL(COOP_GAME_PATH, origin);
  url.searchParams.set('map', mapId);
  return url.toString();
}

function goToCoop(room: string, name: string): void {
  const map = selectedMapId();
  persistMapChoice(map);
  window.location.href = buildCoopGameUrl({ room, name, map });
}

function goToSolo(): void {
  const map = selectedMapId();
  persistMapChoice(map);
  window.location.href = buildSoloGameUrl(map);
}

function renderMapPicker(): void {
  const wrap = document.getElementById('map-picker');
  if (!wrap) return;

  const saved = localStorage.getItem(MAP_STORAGE_KEY) ?? 'quadrants';
  wrap.innerHTML = '';

  for (const opt of MAP_OPTIONS) {
    const label = document.createElement('label');
    label.className = 'map-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'map';
    input.value = opt.id;
    input.checked = opt.id === saved;

    const body = document.createElement('span');
    body.className = 'map-option-body';
    body.innerHTML = `<strong>${opt.name}</strong><span>${opt.description}</span>`;

    label.append(input, body);
    wrap.appendChild(label);
  }
}

function wireTabs(): void {
  const tabCreate = document.getElementById('coop-tab-create');
  const tabJoin = document.getElementById('coop-tab-join');
  const panelCreate = document.getElementById('coop-panel-create');
  const panelJoin = document.getElementById('coop-panel-join');
  if (!tabCreate || !tabJoin || !panelCreate || !panelJoin) return;

  tabCreate.addEventListener('click', () => {
    tabCreate.classList.add('active');
    tabJoin.classList.remove('active');
    panelCreate.hidden = false;
    panelJoin.hidden = true;
  });
  tabJoin.addEventListener('click', () => {
    tabJoin.classList.add('active');
    tabCreate.classList.remove('active');
    panelJoin.hidden = false;
    panelCreate.hidden = true;
  });
}

function wireActions(): void {
  const hostName = document.getElementById('coop-host-name') as HTMLInputElement | null;
  const joinRoom = document.getElementById('coop-join-room') as HTMLInputElement | null;
  const joinName = document.getElementById('coop-join-name') as HTMLInputElement | null;

  document.getElementById('coop-create-btn')?.addEventListener('click', () => {
    const name = sanitizePlayerName(hostName?.value ?? 'Host');
    goToCoop(generateRoomCode(), name);
  });

  document.getElementById('coop-join-btn')?.addEventListener('click', () => {
    const room = parseRoomCodeInput(joinRoom?.value ?? '');
    const name = sanitizePlayerName(joinName?.value ?? 'Guest');
    if (!room) {
      joinRoom?.focus();
      return;
    }
    goToCoop(room, name);
  });

  joinRoom?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('coop-join-btn')?.click();
  });

  document.getElementById('solo-play-btn')?.addEventListener('click', goToSolo);
}

renderMapPicker();
wireTabs();
wireActions();
