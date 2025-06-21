import browser from 'webextension-polyfill';
import { PORT_NAMES, ContentInitMsg, ContentDeltaMsg } from '@src/types/messaging';

type Msg = ContentInitMsg | ContentDeltaMsg;

type Listener = (msg: Msg) => void;

export class PortManager {
  private port: browser.Runtime.Port | null = null;
  private readonly listeners = new Set<Listener>();

  constructor() {
    this.connect();
  }

  private connect(): void {
    try {
      this.port = browser.runtime.connect({ name: PORT_NAMES.CONTENT_PORT });
      this.port.onMessage.addListener((msg: unknown) => {
        // Forward only messages that look like ours
        if (msg && typeof msg === 'object' && 'type' in (msg as any)) {
          this.emit(msg as Msg);
        }
      });
      this.port.onDisconnect.addListener(() => {
        this.port = null;
        // attempt reconnect after small delay
        setTimeout(() => this.connect(), 1000);
      });
    } catch (err) {
      // Retry later
      setTimeout(() => this.connect(), 1000);
    }
  }

  post(msg: Msg): void {
    try {
      this.port?.postMessage(msg);
    } catch (err) {
      // If post fails, try reconnecting immediately
      this.connect();
    }
  }

  onMessage(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(msg: Msg): void {
    this.listeners.forEach((cb) => cb(msg));
  }
}

export const portManager = new PortManager(); 