// ============================================================================
// Lobby invite link — copy friend URL to clipboard.
// ============================================================================

import { buildFriendInviteUrl } from './coopUrls';

export function setupCoopInviteLink(
  roomId: string,
  setStatus: (text: string) => void,
): { refreshInviteUrl: (mapId?: string) => void } {
  const input = document.getElementById('coop-invite-url') as HTMLInputElement | null;
  const btn = document.getElementById('coop-copy-invite-btn') as HTMLButtonElement | null;
  if (!input || !btn) {
    return { refreshInviteUrl: () => {} };
  }

  const refreshInviteUrl = (mapId?: string): void => {
    input.value = buildFriendInviteUrl(roomId, undefined, mapId);
  };
  refreshInviteUrl();

  btn.addEventListener('click', async () => {
    const url = input.value;
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Invite link copied — send it to your friend!');
      btn.textContent = 'Copied!';
      window.setTimeout(() => {
        btn.textContent = 'Copy link';
      }, 2000);
    } catch {
      input.focus();
      input.select();
      setStatus('Select the link and press Ctrl+C to copy.');
    }
  });

  return { refreshInviteUrl };
}
