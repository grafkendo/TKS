// ============================================================================
// WebSocket client for 3D co-op rooms.
// ============================================================================

import type { CoopClientMessage, CoopServerMessage } from '../coop/types';

export type NetClientHandlers = {
  onMessage: (msg: CoopServerMessage) => void;
  onOpen?: () => void;
  onClose?: () => void;
};

export class CoopNetClient {
  private ws: WebSocket | null = null;

  constructor(
    private readonly roomId: string,
    private readonly playerName: string,
    private readonly handlers: NetClientHandlers,
  ) {}

  connect(): void {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const q = new URLSearchParams({ room: this.roomId, name: this.playerName });
    const url = `${proto}//${host}/ws3d?${q}`;
    this.ws = new WebSocket(url);
    this.ws.addEventListener('open', () => this.handlers.onOpen?.());
    this.ws.addEventListener('close', () => this.handlers.onClose?.());
    this.ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as CoopServerMessage;
        this.handlers.onMessage(msg);
      } catch {
        /* ignore */
      }
    });
  }

  send(msg: CoopClientMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
