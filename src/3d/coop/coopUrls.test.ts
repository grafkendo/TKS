import { describe, expect, it } from 'vitest';

import { buildCoopGameUrl, buildFriendInviteUrl, parseRoomCodeInput } from './coopUrls';

describe('coopUrls', () => {
  it('builds game URL from launcher without double /3d/', () => {
    const url = buildCoopGameUrl(
      { room: 'k7m2p9', name: 'Guest' },
      'http://127.0.0.1:5173/index.html',
    );
    expect(url).toBe('http://127.0.0.1:5173/3d/index.html?coop=1&room=k7m2p9&name=Guest');
  });

  it('builds invite URL with map when provided', () => {
    const url = buildFriendInviteUrl(
      'k7m2p9',
      'http://127.0.0.1:5173/3d/index.html?coop=1&room=k7m2p9&name=Host',
      'battlefield',
    );
    expect(url).toBe(
      'http://127.0.0.1:5173/3d/index.html?coop=1&room=k7m2p9&map=battlefield&name=Friend',
    );
  });

  it('builds invite URL from lobby without double /3d/', () => {
    const url = buildFriendInviteUrl(
      'k7m2p9',
      'http://127.0.0.1:5173/3d/index.html?coop=1&room=k7m2p9&name=Host',
    );
    expect(url).toBe('http://127.0.0.1:5173/3d/index.html?coop=1&room=k7m2p9&name=Friend');
  });

  it('parses room code from pasted invite link', () => {
    expect(
      parseRoomCodeInput('http://127.0.0.1:5173/3d/index.html?coop=1&room=k7m2p9&name=Friend'),
    ).toBe('k7m2p9');
  });

  it('parses plain room code', () => {
    expect(parseRoomCodeInput('k7m2p9')).toBe('k7m2p9');
  });
});
