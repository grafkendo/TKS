// ============================================================================
// Co-op URL helpers — room codes and invite links.
// ============================================================================

const ROOM_CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

/** Always resolve from site origin — avoids /3d/3d/... when base is already in /3d/. */
export const COOP_GAME_PATH = '/3d/index.html';

export function generateRoomCode(length = 6): string {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export function sanitizeRoomId(raw: string): string {
  const trimmed = raw.trim().slice(0, 32);
  const cleaned = trimmed.replace(/[^a-zA-Z0-9_-]/g, '');
  return cleaned || 'squad';
}

export function sanitizePlayerName(raw: string): string {
  const trimmed = raw.trim().slice(0, 24);
  return trimmed || 'Guest';
}

/**
 * Parse a room code from plain text or a pasted invite URL.
 * Returns null when nothing usable remains.
 */
export function parseRoomCodeInput(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const room = new URL(trimmed).searchParams.get('room');
      if (room) return sanitizeRoomId(room);
    }
    if (trimmed.includes('room=')) {
      const query = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?')) : `?${trimmed}`;
      const room = new URLSearchParams(query).get('room');
      if (room) return sanitizeRoomId(room);
    }
  } catch {
    /* fall through to plain code */
  }

  const code = trimmed.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
  return code || null;
}

export interface CoopGameUrlParams {
  room: string;
  name?: string;
  /** Map id (`quadrants`, `battlefield`, `urban`). */
  map?: string;
}

/** Build a full co-op game URL from the current origin or an explicit base. */
export function buildCoopGameUrl(params: CoopGameUrlParams, baseHref?: string): string {
  const origin = new URL(baseHref ?? window.location.href).origin;
  const url = new URL(COOP_GAME_PATH, origin);
  url.searchParams.set('coop', '1');
  url.searchParams.set('room', sanitizeRoomId(params.room));
  if (params.map) {
    url.searchParams.set('map', params.map);
  }
  if (params.name) {
    url.searchParams.set('name', sanitizePlayerName(params.name));
  }
  return url.toString();
}

/** Invite link for a second player (placeholder name they can change in lobby). */
export function buildFriendInviteUrl(roomId: string, baseHref?: string): string {
  const base = baseHref ?? window.location.href;
  const map = new URL(base).searchParams.get('map') ?? undefined;
  return buildCoopGameUrl({ room: roomId, name: 'Friend', map }, base);
}
