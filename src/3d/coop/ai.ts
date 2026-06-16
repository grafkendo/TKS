// ============================================================================
// Co-op AI — team-2 heuristics (server-side).
// ============================================================================

import type { CoopGameEvent, CoopGameState } from './types';
import { applyAction, beginHumanRound } from './engine';
import { aiStep } from './aiSteps';

export function runAiPhase(state: CoopGameState): { state: CoopGameState; events: CoopGameEvent[] } {
  let s: CoopGameState = { ...state, phase: 'ai', activePlayerId: null };
  const events: CoopGameEvent[] = [];

  if (s.outcome.ended) return { state: s, events };

  for (let safety = 0; safety < 48; safety++) {
    const aiUnits = s.units.filter((u) => u.team === 2 && !u.destroyed && u.ap > 0);
    if (aiUnits.length === 0) break;

    let anyActed = false;
    for (const u of aiUnits) {
      const step = aiStep(s, u.id);
      s = step.state;
      events.push(...step.events);
      if (step.acted) anyActed = true;
      if (s.outcome.ended) return { state: s, events };
    }
    if (!anyActed) break;
  }

  const round = beginHumanRound(s);
  events.push(...round.events);
  return { state: round.state, events };
}
