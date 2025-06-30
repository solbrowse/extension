import '@src/utils/logger';
import browser from 'webextension-polyfill';
import settingsService from '@src/utils/settings';
import { IframeInjector, IframeInstance } from '@src/utils/inject';
import conversation, { TabConversation } from '@src/services/conversation';
import { PortManager } from '@src/services/messaging/portManager';
import { attachToggleKeybind } from '@src/services/keybind';
import { IframeActionMsg, IframeCloseMsg, IframeGetCurrentTabMsg, IframeCurrentTabResponseMsg } from '@src/types/messaging';

export class SideBarController {
  private sideBarInstance: IframeInstance | null = null;
  private isSideBarVisible = false;
  private sideBarEnabled = false;
  private targetKeybindString = '';
  private keypressDisposer: (() => void) | null = null;
  private portManager = PortManager.getInstance();
  private stateChangeCleanup: (() => void) | null = null;
  private tabId: string;

  constructor() {
    this.tabId = (window as any).solTabId ?? '';
  }

  async init(): Promise<void> {
    await this.loadSettings();
    this.setupMessageHandlers();
    this.setupStateSync();
  }

  cleanup(): void {
    this.hide();
    this.portManager.cleanup();
    this.keypressDisposer?.();
    this.stateChangeCleanup?.();
  }

  /** Public accessor for SideBar visibility state */
  isVisible(): boolean {
    return this.isSideBarVisible;
  }

  // ---------------------------------------------------------
  // Visibility helpers
  // ---------------------------------------------------------

  async show(force = false): Promise<void> {
    if ((!this.sideBarEnabled && !force) || this.isSideBarVisible) return;

    const settings = await settingsService.getAll();

    this.sideBarInstance = await IframeInjector.inject({
      iframeUrl: browser.runtime.getURL('src/pages/sidebar/index.html'),
      containerId: 'sol-sidebar-container',
      settings,
      position: settings.features?.sideBar?.position ?? 'left',
    });

    this.isSideBarVisible = true;
  }

  hide(): void {
    if (!this.isSideBarVisible) return;

    // Fully remove the iframe from the DOM
    if (this.sideBarInstance) {
      this.sideBarInstance.remove();
      this.sideBarInstance = null;
    }

    this.isSideBarVisible = false;
    // Restore focus so keybind continues working
    if (document.activeElement && document.activeElement !== document.body) {
      (document.activeElement as HTMLElement).blur();
    }
    document.body.focus();
  }

  /** Close with animation - triggers the same close animation as the X button */
  closeWithAnimation(): void {
    if (!this.isSideBarVisible || !this.sideBarInstance?.iframe.contentWindow) return;

    // Send a message to the iframe to trigger the close animation
    this.sideBarInstance.iframe.contentWindow.postMessage({
      type: 'sol-trigger-close'
    }, '*');

    // The iframe will handle the animation and send IFRAME_CLOSE message
    // which will be caught by our IFRAME_CLOSE handler that calls hide()
  }

  // ---------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------

  private async loadSettings(): Promise<void> {
    const settings = await settingsService.getAll();
    // Handle potential missing nested fields due to shallow merges of stored settings
    const sideBarSettings = settings.features?.sideBar ?? {
      isEnabled: true,
      keybind: 'Ctrl+Enter',
      position: 'left',
    };

    this.sideBarEnabled = sideBarSettings.isEnabled ?? true;
    this.targetKeybindString = sideBarSettings.keybind || 'Ctrl+Enter';

    if (this.sideBarEnabled) {
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
      isEnabled: () => this.sideBarEnabled,
      isVisible: () => this.isSideBarVisible,
      show: () => this.show(),
      hide: () => this.closeWithAnimation(),
      log: console.log.bind(console),
    });
  }

  private setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.features) {
        const newFeatures = changes.features.newValue as any;
        if (newFeatures?.sideBar) {
          this.sideBarEnabled = newFeatures.sideBar.isEnabled;
          this.targetKeybindString = newFeatures.sideBar.keybind;
          this.setupKeybindListener(this.targetKeybindString);

          if (!this.sideBarEnabled && this.isSideBarVisible) {
            this.hide();
          }
        }
      }
    });
  }

  private setupMessageHandlers(): void {
    // Handle iframe close requests
    this.portManager.addIframeHandler<IframeCloseMsg>('IFRAME_CLOSE', (message, source) => {
      if (this.isSideBarVisible) this.hide();
    });

    // Handle current tab requests
    this.portManager.addIframeHandler<IframeGetCurrentTabMsg>('IFRAME_GET_CURRENT_TAB', (message, source) => {
      const response: IframeCurrentTabResponseMsg = {
        type: 'IFRAME_CURRENT_TAB_RESPONSE',
        tabId: (window as any).solTabId ?? null,
        url: window.location.href,
        title: document.title,
      };
      this.portManager.sendToIframe(source, response);
    });
  }

  private setupStateSync(): void {
    // Listen for state changes from unified conversation service for this tab
    this.stateChangeCleanup = conversation.subscribeToTab(this.tabId, (state: TabConversation) => {
      this.updateIframeState();
    });
  }

  private updateIframeState(): void {
    if (this.sideBarInstance && this.isSideBarVisible && this.sideBarInstance.iframe.contentWindow) {
      const state = conversation.getTabState(this.tabId);
      // Send state update via postMessage
      this.sideBarInstance.iframe.contentWindow.postMessage({
        type: 'sol-state-update',
        conversationHistory: state.messages.map(msg => ({
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp
        })),
        conversationId: state.conversationId
      }, '*');
    }
  }
} 