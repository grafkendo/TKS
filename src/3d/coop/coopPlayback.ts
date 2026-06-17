// ============================================================================
// Co-op event playback — serialize server events into visible animations.
// ============================================================================

import type { CoopGameEvent, CoopGameState } from './types';

const EVENT_GAP_MS = 280;

export interface CoopPlaybackHost {
  playEvent: (ev: CoopGameEvent) => Promise<void>;
  applyState: (state: CoopGameState) => Promise<void>;
  setBusy: (busy: boolean) => void;
}

let host: CoopPlaybackHost | null = null;
let queue: Promise<void> = Promise.resolve();

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isVisualEvent(ev: CoopGameEvent): boolean {
  return ev.kind === 'moved' || ev.kind === 'shot' || ev.kind === 'pivoted' || ev.kind === 'spawned';
}

export function initCoopPlayback(h: CoopPlaybackHost): void {
  host = h;
}

export function enqueueCoopEvents(events: CoopGameEvent[]): void {
  if (!host || events.length === 0) return;
  const visual = events.filter(isVisualEvent);
  if (visual.length === 0) return;

  queue = queue
    .then(async () => {
      host!.setBusy(true);
      try {
        for (const ev of events) {
          if (isVisualEvent(ev)) {
            await host!.playEvent(ev);
            await delay(EVENT_GAP_MS);
          }
        }
      } finally {
        host!.setBusy(false);
      }
    })
    .catch((err) => {
      console.error('[coopPlayback] event playback failed', err);
      host?.setBusy(false);
    });
}

/** Apply authoritative state after any queued animations finish. */
export function enqueueCoopState(state: CoopGameState): void {
  if (!host) return;
  queue = queue
    .then(() => host!.applyState(state))
    .catch((err) => console.error('[coopPlayback] state sync failed', err));
}
