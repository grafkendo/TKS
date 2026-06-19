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
import { startMapPreview, type MapPreviewHandle } from './3d/coop/mapSelectPreview';
import { stopMapEnemyCardPreviews } from './3d/debug/mapEnemyCards';
import { MAP_OPTIONS } from './3d/maps/index';

const MAP_STORAGE_KEY = 'tackticus.map';

let soloPreview: MapPreviewHandle | null = null;
let hostPreview: MapPreviewHandle | null = null;

function selectedMapId(inputName: string): string {
  const checked = document.querySelector<HTMLInputElement>(`input[name="${inputName}"]:checked`);
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

function goToCoopCreate(room: string, name: string): void {
  const map = selectedMapId('host-map');
  persistMapChoice(map);
  window.location.href = buildCoopGameUrl({ room, name, map });
}

function goToCoopJoin(room: string, name: string): void {
  window.location.href = buildCoopGameUrl({ room, name });
}

function goToSolo(): void {
  const map = selectedMapId('solo-map');
  persistMapChoice(map);
  window.location.href = buildSoloGameUrl(map);
}

function wireMapPreview(
  inputName: string,
  canvasId: string,
  titleId: string,
  descId: string,
  cardsId: string,
  getHandle: () => MapPreviewHandle | null,
  setHandle: (h: MapPreviewHandle | null) => void,
): void {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement | null;
  const cards = document.getElementById(cardsId);
  if (!canvas || !cards) return;

  const saved = localStorage.getItem(MAP_STORAGE_KEY) ?? 'quadrants';
  setHandle(startMapPreview(saved, canvas, cards));

  const syncTitle = (mapId: string): void => {
    const opt = MAP_OPTIONS.find((m) => m.id === mapId);
    const title = document.getElementById(titleId);
    const desc = document.getElementById(descId);
    if (title) title.textContent = opt?.name ?? mapId;
    if (desc) desc.textContent = opt?.description ?? '';
  };
  syncTitle(saved);

  for (const input of document.querySelectorAll<HTMLInputElement>(`input[name="${inputName}"]`)) {
    input.addEventListener('change', () => {
      if (!input.checked) return;
      getHandle()?.setMap(input.value);
      syncTitle(input.value);
      persistMapChoice(input.value);
    });
  }
}

function renderMapPicker(containerId: string, inputName: string): void {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;

  const saved = localStorage.getItem(MAP_STORAGE_KEY) ?? 'quadrants';
  wrap.innerHTML = '';

  for (const opt of MAP_OPTIONS) {
    const label = document.createElement('label');
    label.className = 'map-option';

    const input = document.createElement('input');
    input.type = 'radio';
    input.name = inputName;
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
    goToCoopCreate(generateRoomCode(), name);
  });

  document.getElementById('coop-join-btn')?.addEventListener('click', () => {
    const room = parseRoomCodeInput(joinRoom?.value ?? '');
    const name = sanitizePlayerName(joinName?.value ?? 'Guest');
    if (!room) {
      joinRoom?.focus();
      return;
    }
    goToCoopJoin(room, name);
  });

  joinRoom?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('coop-join-btn')?.click();
  });

  document.getElementById('solo-play-btn')?.addEventListener('click', goToSolo);
}

function syncHostMapFromSolo(): void {
  const solo = document.querySelector<HTMLInputElement>('input[name="solo-map"]:checked');
  const host = document.querySelector<HTMLInputElement>(`input[name="host-map"][value="${solo?.value ?? 'quadrants'}"]`);
  if (host) host.checked = true;
}

renderMapPicker('solo-map-picker', 'solo-map');
renderMapPicker('host-map-picker', 'host-map');
syncHostMapFromSolo();

wireMapPreview(
  'solo-map',
  'solo-map-preview',
  'solo-map-preview-title',
  'solo-map-preview-desc',
  'solo-map-enemy-cards',
  () => soloPreview,
  (h) => { soloPreview = h; },
);

wireMapPreview(
  'host-map',
  'host-map-preview',
  'host-map-preview-title',
  'host-map-preview-desc',
  'host-map-enemy-cards',
  () => hostPreview,
  (h) => { hostPreview = h; },
);

for (const input of document.querySelectorAll<HTMLInputElement>('input[name="solo-map"]')) {
  input.addEventListener('change', () => {
    if (!input.checked) return;
    const hostMatch = document.querySelector<HTMLInputElement>(
      `input[name="host-map"][value="${input.value}"]`,
    );
    if (hostMatch) {
      hostMatch.checked = true;
      hostPreview?.setMap(input.value);
      const opt = MAP_OPTIONS.find((m) => m.id === input.value);
      const title = document.getElementById('host-map-preview-title');
      const desc = document.getElementById('host-map-preview-desc');
      if (title) title.textContent = opt?.name ?? input.value;
      if (desc) desc.textContent = opt?.description ?? '';
    }
  });
}

window.addEventListener('beforeunload', () => {
  soloPreview?.stop();
  hostPreview?.stop();
  stopMapEnemyCardPreviews();
});

wireTabs();
wireActions();
