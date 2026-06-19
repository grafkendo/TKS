// ============================================================================
// Map enemy cards — rotating previews for enemies that spawn on a map.
// ============================================================================

import { ARCHETYPES, type ArchetypeKey } from '../enemies/archetypes';
import { enemiesForMap } from '../maps/mapEnemies';
import {
  archetypeCardStats,
  archetypeModelLabel,
  startEnemyPreview,
  stopAllEnemyPreviews,
  type EnemyPreviewHandle,
} from './enemySelectPreview';

const previewHandles: EnemyPreviewHandle[] = [];
let lastEnemyCardsMapId: string | null = null;

export function updateMapEnemyCards(mapId: string, container: HTMLElement | null): void {
  if (!container) return;
  if (mapId === lastEnemyCardsMapId && container.childElementCount > 0) return;
  lastEnemyCardsMapId = mapId;

  stopAllEnemyPreviews();
  previewHandles.length = 0;
  container.innerHTML = '';

  const keys = enemiesForMap(mapId);
  if (keys.length === 0) return;

  const heading = document.createElement('p');
  heading.className = 'map-enemy-cards-heading';
  heading.textContent = 'Enemies on this map';
  container.appendChild(heading);

  const row = document.createElement('div');
  row.className = 'map-enemy-cards-row';
  container.appendChild(row);

  for (const key of keys) {
    const arch = ARCHETYPES[key];

    const card = document.createElement('article');
    card.className = 'map-enemy-card';

    const canvas = document.createElement('canvas');
    canvas.className = 'map-enemy-preview';
    canvas.width = 120;
    canvas.height = 86;
    canvas.setAttribute('aria-hidden', 'true');

    const title = document.createElement('div');
    title.className = 'map-enemy-card-title';
    title.textContent = arch.displayName;

    const model = document.createElement('div');
    model.className = 'map-enemy-card-model';
    model.textContent = archetypeModelLabel(key);

    const stats = document.createElement('div');
    stats.className = 'map-enemy-card-stats';
    stats.textContent = archetypeCardStats(key);

    card.append(canvas, title, model, stats);
    row.appendChild(card);

    previewHandles.push(startEnemyPreview(key, canvas));
  }
}

export function stopMapEnemyCardPreviews(): void {
  stopAllEnemyPreviews();
  previewHandles.length = 0;
  lastEnemyCardsMapId = null;
}
