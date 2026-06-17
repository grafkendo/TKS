// ============================================================================
// gameLog — ring-buffer diagnostics for turn / AI / animation hangs.
//
// Enable console output: ?debug=1  or  localStorage.setItem('tackticus.debug', '1')
// Dump from devtools: tackticus.debugDump() / tackticus.debugState()
// ============================================================================

export type LogCategory = 'turn' | 'ai' | 'anim' | 'spawn' | 'input' | 'watchdog' | 'coop' | 'pipeline';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  atMs: number;
  level: LogLevel;
  cat: LogCategory;
  msg: string;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 600;
const entries: LogEntry[] = [];

function consoleEnabled(): boolean {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem('tackticus.debug') === '1') {
      return true;
    }
  } catch {
    /* private browsing */
  }
  if (typeof location !== 'undefined') {
    return new URLSearchParams(location.search).get('debug') === '1';
  }
  return false;
}

let mirrorToConsole = consoleEnabled();

function push(level: LogLevel, cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    atMs: performance.now(),
    level,
    cat,
    msg,
    data,
  };
  entries.push(entry);
  if (entries.length > MAX_ENTRIES) entries.shift();

  if (mirrorToConsole) {
    const prefix = `[tackticus:${cat}] ${msg}`;
    if (level === 'error') console.error(prefix, data ?? '');
    else if (level === 'warn') console.warn(prefix, data ?? '');
    else console.log(prefix, data ?? '');
  }
}

export const gameLog = {
  info(cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
    push('info', cat, msg, data);
  },
  warn(cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
    push('warn', cat, msg, data);
  },
  error(cat: LogCategory, msg: string, data?: Record<string, unknown>): void {
    push('error', cat, msg, data);
  },
  setConsoleMirror(on: boolean): void {
    mirrorToConsole = on;
    try {
      if (on) localStorage.setItem('tackticus.debug', '1');
      else localStorage.removeItem('tackticus.debug');
    } catch {
      /* ignore */
    }
  },
  isConsoleMirror(): boolean {
    return mirrorToConsole;
  },
  getEntries(): readonly LogEntry[] {
    return entries;
  },
  dump(max = 80): void {
    const slice = entries.slice(-max);
    console.group(`tackticus debug log (last ${slice.length} of ${entries.length})`);
    for (const e of slice) {
      const t = (e.atMs / 1000).toFixed(2);
      const line = `${t}s [${e.level}/${e.cat}] ${e.msg}`;
      if (e.data) console.log(line, e.data);
      else console.log(line);
    }
    console.groupEnd();
  },
  clear(): void {
    entries.length = 0;
  },
};

/** Elapsed ms since a marker; useful in async pipelines. */
export function logElapsed(
  cat: LogCategory,
  label: string,
  startedAt: number,
  data?: Record<string, unknown>,
): void {
  gameLog.info(cat, `${label} (+${Math.round(performance.now() - startedAt)}ms)`, data);
}
