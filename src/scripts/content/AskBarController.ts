import '@src/utils/logger';
import browser from 'webextension-polyfill';
import { get } from '@src/services/storage';
import { IframeInjector, IframeInstance } from '@src/utils/iframeInjector';
import { TabConversationManager } from '@src/utils/tabConversationManager';
import { MessageBus } from '@src/utils/messageHandler';
import { attachToggleKeybind } from '@src/services/keybindManager';

export class AskBarController {
  private askBarInstance: IframeInstance | null = null;
  private isAskBarVisible = false;
  private askBarEnabled = false;
  private targetKeybindString = '';
  private keypressDisposer: (() => void) | null = null;
  private onAskBarOpenCallback: (() => void) | null = null;

  constructor(private tabManager: TabConversationManager) {}

  /** Set callback to trigger when Ask Bar opens */
  setOnOpenCallback(callback: () => void): void {
    this.onAskBarOpenCallback = callback;
  }

  async init(): Promise<void> {
    await this.loadSettings();
    this.setupMessageHandlers();
  }

  cleanup(): void {
    this.hide();
    MessageBus.cleanup();
    this.keypressDisposer?.();
  }

  /** Public accessor for Ask Bar visibility state */
  isVisible(): boolean {
    return this.isAskBarVisible;
  }

  // ---------------------------------------------------------
  // Visibility helpers
  // ---------------------------------------------------------

  async show(): Promise<void> {
    if (!this.askBarEnabled || this.isAskBarVisible) return;

    const settings = await get();
    const existingConversation = this.tabManager.getConversation() || null;

    this.askBarInstance = await IframeInjector.inject({
      iframeUrl: browser.runtime.getURL('src/pages/askbar/index.html'),
      containerId: 'sol-askbar-container',
      settings,
      position: settings.features.askBar.position,
      existingConversation: existingConversation as any,
    });

    this.isAskBarVisible = true;
    
    // Trigger scraping when Ask Bar opens
    if (this.onAskBarOpenCallback) {
      this.onAskBarOpenCallback();
    }
  }

  hide(): void {
    if (!this.isAskBarVisible) return;

    // Fully remove the iframe from the DOM.  This gets rid of any lingering
    // overlay that could swallow future key events on sites like GitHub.
    if (this.askBarInstance) {
      this.askBarInstance.remove();
      this.askBarInstance = null;
    }

    this.isAskBarVisible = false;
    // Restore focus so keybind continues working
    if (document.activeElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur();
    }
    document.body.focus();
  }

  // ---------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------

  private async loadSettings(): Promise<void> {
    const settings = await get();
    this.askBarEnabled = settings.features.askBar.isEnabled ?? false;
    this.targetKeybindString = settings.features.askBar.keybind || 'Ctrl+F';

    if (this.askBarEnabled) {
      this.setupKeybindListener(this.targetKeybindString);
      this.setupStorageListener();
    }
  }

  private setupKeybindListener(keybindStr: string): void {
    // Dispose previous
    if (this.keypressDisposer) {
      this.keypressDisposer();
    }

    this.keypressDisposer = attachToggleKeybind({
      keybind: keybindStr,
      isEnabled: () => this.askBarEnabled,
      isVisible: () => this.isAskBarVisible,
      show: () => this.show(),
      hide: () => this.hide(),
      log: console.log.bind(console),
    });
  }

  private setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.features) {
        const newFeatures = changes.features.newValue as any;
        if (newFeatures?.askBar) {
          this.askBarEnabled = newFeatures.askBar.isEnabled;
          this.targetKeybindString = newFeatures.askBar.keybind;
          this.setupKeybindListener(this.targetKeybindString);

          if (!this.askBarEnabled && this.isAskBarVisible) {
            this.hide();
          }
        }
      }
    });
  }

  private setupMessageHandlers(): void {
    MessageBus.addHandler('sol-close-askbar', () => {
      if (this.isAskBarVisible) this.hide();
    });

    MessageBus.addHandler('sol-update-tab-conversation', (data) => {
      this.tabManager.setConversation(data.messages, data.conversationId);
    });

    MessageBus.addHandler('sol-get-current-tab', () => {
      if (this.askBarInstance) {
        this.askBarInstance.sendMessage({
          type: 'sol-current-tab-response',
          tabId: (window as any).solTabId ?? null,
          url: window.location.href,
          title: document.title,
        });
      }
    });
  }
} 