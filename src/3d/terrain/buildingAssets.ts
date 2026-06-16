// ============================================================================
// Building facade texture URLs — served from /public/assets/buildings/.
// ============================================================================

import type { BuildingStyle } from './types';

export const BUILDING_TEXTURE_URLS: Record<BuildingStyle, string> = {
  concrete: '/assets/buildings/concrete_facade.png',
  glass: '/assets/buildings/glass_facade.png',
  brick: '/assets/buildings/brick_facade.png',
};
