// ============================================================================
// Preview lifecycle — tear down lobby WebGL contexts on HMR / page unload.
// ============================================================================

import { stopActiveMapPreview } from './coop/mapSelectPreview';
import { stopAllMechPreviews } from './coop/mechSelectPreview';
import { stopMapEnemyCardPreviews } from './debug/mapEnemyCards';

/** Release every lobby thumbnail renderer (map + mech + enemy cards). */
export function disposeAllPreviews(): void {
  stopActiveMapPreview();
  stopAllMechPreviews();
  stopMapEnemyCardPreviews();
}
