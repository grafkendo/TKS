// ============================================================================
// Lobby invite link — copy friend URL to clipboard.
// ============================================================================

import { buildFriendInviteUrl } from './coopUrls';

export function setupCoopInviteLink(
  roomId: string,
  setStatus: (text: string) => void,
): void {
  const input = document.getElementById('coop-invite-url') as HTMLInputElement | null;
  const btn = document.getElementById('coop-copy-invite-btn') as HTMLButtonElement | null;
  if (!input || !btn) return;

  const refresh = (): void => {
    input.value = buildFriendInviteUrl(roomId);
  };
  refresh();

  btn.addEventListener('click', async () => {
    const url = buildFriendInviteUrl(roomId);
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
}
