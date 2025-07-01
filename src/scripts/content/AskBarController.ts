import '@src/utils/logger';
import browser from 'webextension-polyfill';
import settingsService from '@src/utils/settings';
import { IframeInjector, IframeInstance } from '@src/utils/inject';
import conversation, { TabConversation } from '@src/services/conversation';
import { PortManager } from '@src/services/messaging/portManager';
import { attachToggleKeybind } from '@src/services/keybind';
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

  constructor(private tabId: string) {}

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

    const settings = await settingsService.getAll();
    const existingConversation = conversation.getTabState(this.tabId);

    const colorScheme = this.detectColorScheme();

    this.askBarInstance = await IframeInjector.inject({
      iframeUrl: browser.runtime.getURL('src/pages/askbar/index.html'),
      containerId: 'sol-askbar-container',
      settings,
      position: settings.features.askBar.position,
      existingConversation: existingConversation as any,
      colorScheme,
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
    const settings = await settingsService.getAll();
    this.askBarEnabled = settings.features.askBar.isEnabled ?? true;
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
      // Dispatch actions to the unified conversation service for this tab
      switch (message.action.type) {
        case 'ADD_USER_MESSAGE':
          conversation.addTabUserMessage(
            this.tabId, 
            message.action.payload.content,
            message.action.payload.tabIds
          );
          break;
        case 'ADD_ASSISTANT_MESSAGE':
          conversation.addTabAssistantMessage(
            this.tabId,
            message.action.payload.content
          );
          break;
        case 'UPDATE_STREAMING_MESSAGE':
          conversation.updateTabStreamingMessage(
            this.tabId,
            message.action.payload.content
          );
          break;
        case 'CLEAR_CONVERSATION':
          conversation.clearTabConversation(this.tabId);
          break;
        case 'UPDATE_CONVERSATION_ID':
          conversation.setTabConversationId(
            this.tabId,
            message.action.payload.conversationId
          );
          break;
        default:
          // Handle other actions as needed
          break;
      }
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
    // Listen for state changes from unified conversation service for this tab
    this.stateChangeCleanup = conversation.subscribeToTab(this.tabId, (state: TabConversation) => {
      this.updateIframeState();
    });
  }

  private updateIframeState(): void {
    if (this.askBarInstance && this.isAskBarVisible && this.askBarInstance.iframe.contentWindow) {
      const state = conversation.getTabState(this.tabId);
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
    // Listen for expand requests from the iframe
    window.addEventListener('message', (event) => {
      if (event.data?.type === 'sol-expand-to-sidebar') {
        this.expandToSidebar();
      } else if (event.data?.type === 'sol-open-sidebar') {
        this.expandToSidebar();
      } else if (event.data?.type === 'sol-close-askbar') {
        this.hide(); // Direct hide like expand button
      }
    });
  }

  private expandToSidebar(): void {
    if (!this.sideBarController) {
      console.warn('Sol AskBar: SideBar controller not available for expand');
      return;
    }

    // Get current tab conversation state
    const tabState = conversation.getTabState(this.tabId);
    
    // Sync tab conversation to global if it has content
    if (tabState.messages.length > 0) {
      conversation.syncTabToGlobal(this.tabId)
        .then(() => {
          // Show sidebar after sync with force=true
          this.sideBarController.show(true);
          // Hide ask bar
          this.hide();
        })
        .catch(error => {
          console.error('Sol AskBar: Failed to sync conversation to global:', error);
          // Still show sidebar even if sync fails
          this.sideBarController.show(true);
          this.hide();
        });
    } else {
      // No conversation to sync, just show sidebar with force=true
      this.sideBarController.show(true);
      this.hide();
    }
  }

  // ---------------------------------------------------------
  // Helper to infer whether the host page is predominantly dark
  // ---------------------------------------------------------

  private detectColorScheme(): 'light' | 'dark' {
    try {
      // Prefer explicit meta if host declares it
      const meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null;
      if (meta?.content?.includes('dark') && !meta.content.includes('light')) {
        return 'dark';
      }

      // Use only <body> background, ignore <html>
      const bg = getComputedStyle(document.body).backgroundColor;
      if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)') {
        return 'light';
      }
      const rgbMatch = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1], 10);
        const g = parseInt(rgbMatch[2], 10);
        const b = parseInt(rgbMatch[3], 10);
        const a = rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1;
        if (a < 0.95) return 'light'; // Only treat as dark if fully opaque
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        return luminance < 128 ? 'dark' : 'light';
      }
    } catch (e) {
      console.warn('Sol: Failed to detect page color scheme, defaulting to light', e);
    }
    return 'light';
  }
} 