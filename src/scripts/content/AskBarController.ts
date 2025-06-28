import '@src/utils/logger';
import browser from 'webextension-polyfill';
import { get } from '@src/services/storage';
import { IframeInjector, IframeInstance } from '@src/utils/iframeInjector';
import { TabConversationManager, TabConversation } from '@src/utils/tabConversationManager';
import { PortManager } from '@src/services/messaging/portManager';
import { attachToggleKeybind } from '@src/services/keybindManager';
import { IframeActionMsg, IframeCloseMsg, IframeGetCurrentTabMsg, IframeCurrentTabResponseMsg } from '@src/types/messaging';

export class AskBarController {
  private askBarInstance: IframeInstance | null = null;
  private isAskBarVisible = false;
  private askBarEnabled = false;
  private targetKeybindString = '';
  private keypressDisposer: (() => void) | null = null;
  private onAskBarOpenCallback: (() => void) | null = null;
  private portManager = PortManager.getInstance();
  private stateChangeCleanup: (() => void) | null = null;
  private sideBarController: any = null; // Will be injected

  constructor(private tabManager: TabConversationManager) {}

  /** Set callback to trigger when Ask Bar opens */
  setOnOpenCallback(callback: () => void): void {
    this.onAskBarOpenCallback = callback;
  }

  /** Set reference to sidebar controller for expand functionality */
  setSideBarController(sideBarController: any): void {
    this.sideBarController = sideBarController;
  }

  async init(): Promise<void> {
    await this.loadSettings();
    this.setupMessageHandlers();
    this.setupStateSync();
    this.setupIframeMessageListener();
  }

  cleanup(): void {
    this.hide();
    this.portManager.cleanup();
    this.keypressDisposer?.();
    this.stateChangeCleanup?.();
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

  /** Close with animation - triggers the same close animation as the X button */
  closeWithAnimation(): void {
    if (!this.isAskBarVisible || !this.askBarInstance?.iframe.contentWindow) return;

    // Send a message to the iframe to trigger the close animation
    // This mimics what happens when the X button is clicked
    this.askBarInstance.iframe.contentWindow.postMessage({
      type: 'sol-trigger-close'
    }, '*');

    // The iframe will handle the animation and send IFRAME_CLOSE message
    // which will be caught by our IFRAME_CLOSE handler that calls hide()
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
      hide: () => this.closeWithAnimation(),
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
    // Handle iframe actions
    this.portManager.addIframeHandler<IframeActionMsg>('IFRAME_ACTION', (message, source) => {
      this.tabManager.dispatch(message.action);
    });

    // Handle iframe close requests
    this.portManager.addIframeHandler<IframeCloseMsg>('IFRAME_CLOSE', (message, source) => {
      if (this.isAskBarVisible) this.hide();
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
    // Listen for state changes from TabConversationManager
    this.stateChangeCleanup = this.tabManager.addStateChangeHandler((state: TabConversation) => {
      this.updateIframeState();
    });
  }

  private updateIframeState(): void {
    if (this.askBarInstance && this.isAskBarVisible && this.askBarInstance.iframe.contentWindow) {
      const state = this.tabManager.getConversation();
      // Send state update via postMessage
      this.askBarInstance.iframe.contentWindow.postMessage({
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

  private setupIframeMessageListener(): void {
    // Listen for messages from iframe (e.g., expand to sidebar)
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sol-open-sidebar' && this.sideBarController) {
        // Open sidebar (force=true bypasses disabled flag)
        this.sideBarController.show(true);
        // Optionally close the askbar when opening sidebar
        // this.closeWithAnimation();
      }
    });
  }
} 