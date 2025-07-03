import '@src/utils/logger';
import browser from 'webextension-polyfill';
import settingsService from '@src/utils/settings';
import { ShadowUiInjector, ShadowInstance } from '@src/utils/shadowInject';
import { ShadowRenderer } from '@src/utils/shadowRender';
import conversation, { TabConversation } from '@src/services/conversation';
import { PortManager } from '@src/services/messaging/portManager';
import { attachToggleKeybind } from '@src/services/keybind';
import { ShadowGetCurrentTabMsg, ShadowCurrentTabResponseMsg } from '@src/types/messaging';

export class AskBarController {
  private shadowInstance: ShadowInstance | null = null;
  private renderInstance: any = null;
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

    // Use Shadow DOM injection
    this.shadowInstance = await ShadowUiInjector.inject({
      containerId: 'sol-askbar-container',
      settings,
      position: settings.features.askBar.position,
      existingConversation: existingConversation as any,
      colorScheme,
    });

    // Render React component in shadow DOM
    this.renderInstance = ShadowRenderer.renderAskBar(
      this.shadowInstance.shadowRoot.getElementById('shadow-root') as HTMLElement,
      {
        containerId: 'sol-askbar-container',
        position: settings.features.askBar.position,
        colorScheme,
        existingConversation: existingConversation as any,
      }
    );

    // Set up shadow DOM event listeners
    this.setupShadowEventListeners();

    this.isAskBarVisible = true;
    
    // Trigger scraping when Ask Bar opens
    if (this.onAskBarOpenCallback) {
      this.onAskBarOpenCallback();
    }
  }

  hide(): void {
    if (!this.isAskBarVisible) return;

    // Clean up shadow DOM instances
    if (this.renderInstance) {
      this.renderInstance.unmount();
      this.renderInstance = null;
    }
    if (this.shadowInstance) {
      this.shadowInstance.remove();
      this.shadowInstance = null;
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
    if (!this.isAskBarVisible || !this.shadowInstance?.hostElement) return;

    // Send a message to the shadow DOM to trigger the close animation
    this.shadowInstance.hostElement.dispatchEvent(new CustomEvent('sol-shadow-message', {
      detail: { type: 'sol-trigger-close' },
      bubbles: false,
      composed: false
    }));

    // The component will handle the animation and send close message back
    // which will be caught by our shadow event handler that calls hide()
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
    // Shadow DOM communication is handled in setupShadowEventListeners()
    // No iframe handlers needed anymore
  }

  private setupStateSync(): void {
    // Listen for state changes from unified conversation service for this tab
    this.stateChangeCleanup = conversation.subscribeToTab(this.tabId, (state: TabConversation) => {
      this.updateShadowState();
    });
  }

  private updateShadowState(): void {
    if (this.shadowInstance && this.isAskBarVisible && this.renderInstance) {
      const state = conversation.getTabState(this.tabId);
      // Update the React component props directly since we're in the same context
      this.renderInstance.updateProps({
        conversationHistory: state.messages.map(msg => ({
          type: msg.type,
          content: msg.content,
          timestamp: msg.timestamp
        })),
        conversationId: state.conversationId
      });
    }
  }

  private setupShadowEventListeners(): void {
    if (!this.shadowInstance) return;

    // Listen for events from shadow DOM components
    const handleShadowMessage = (event: CustomEvent) => {
      const message = event.detail;
      
      switch (message?.type) {
        case 'sol-expand-to-sidebar':
        case 'sol-open-sidebar':
          this.expandToSidebar();
          break;
        case 'sol-close-askbar':
          this.hide();
          break;
        case 'CONVERSATION_ACTION':
          // Handle conversation actions directly
          this.handleConversationAction(message);
          break;
        case 'GET_CURRENT_TAB':
          // Handle tab information requests
          this.handleTabInfoRequest(message);
          break;
        default:
          break;
      }
    };

    this.shadowInstance.hostElement.addEventListener('sol-shadow-message', handleShadowMessage as EventListener);
  }

  private handleConversationAction(message: any): void {
    // Handle actions that would normally go through PortManager for iframes
    // but now come directly from shadow DOM components
    if (message.action) {
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
          break;
      }
    }
  }

  private handleTabInfoRequest(message: any): void {
    // Respond to tab information requests from shadow DOM components
    if (this.shadowInstance) {
      this.shadowInstance.hostElement.dispatchEvent(new CustomEvent('sol-shadow-message', {
        detail: {
          type: 'TAB_INFO_RESPONSE',
          requestId: message.requestId,
        tabId: (window as any).solTabId ?? null,
        url: window.location.href,
        title: document.title,
        },
        bubbles: false,
        composed: false
      }));
    }
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