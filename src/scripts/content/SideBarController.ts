import '@src/utils/logger';
import browser from 'webextension-polyfill';
import settingsService from '@src/utils/settings';
import { ShadowUiInjector, ShadowInstance } from '@src/utils/shadowInject';
import { ShadowRenderer } from '@src/utils/shadowRender';
import { PortManager } from '@src/services/messaging/portManager';
import { attachToggleKeybind } from '@src/services/keybind';

export class SideBarController {
  private shadowInstance: ShadowInstance | null = null;
  private renderInstance: any = null;
  private isSideBarVisible = false;
  private sideBarEnabled = false;
  private targetKeybindString = '';
  private keypressDisposer: (() => void) | null = null;
  private onSideBarOpenCallback: (() => void) | null = null;
  private portManager = PortManager.getInstance();

  constructor() {}

  /** Set callback to trigger when Side Bar opens */
  setOnOpenCallback(callback: () => void): void {
    this.onSideBarOpenCallback = callback;
  }

  async init(): Promise<void> {
    await this.loadSettings();
    this.setupMessageHandlers();
  }

  cleanup(): void {
    this.hide();
    this.portManager.cleanup();
    this.keypressDisposer?.();
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
    const colorScheme = this.detectColorScheme();

    // Use Shadow DOM injection
    this.shadowInstance = await ShadowUiInjector.inject({
      containerId: 'sol-sidebar-container',
      settings,
      position: settings.features?.sideBar?.position ?? 'left',
      colorScheme,
    });

    // Render React component in shadow DOM
    this.renderInstance = ShadowRenderer.renderSideBar(
      this.shadowInstance.shadowRoot.getElementById('shadow-root') as HTMLElement,
      {
        containerId: 'sol-sidebar-container',
        position: settings.features?.sideBar?.position ?? 'left',
        colorScheme,
      }
    );

    // Set up shadow DOM event listeners
    this.setupShadowEventListeners();

    this.isSideBarVisible = true;
    
    // Trigger callback when Side Bar opens
    if (this.onSideBarOpenCallback) {
      this.onSideBarOpenCallback();
    }
  }

  hide(): void {
    if (!this.isSideBarVisible) return;

    // Clean up shadow DOM instances
    if (this.renderInstance) {
      this.renderInstance.unmount();
      this.renderInstance = null;
    }
    if (this.shadowInstance) {
      this.shadowInstance.remove();
      this.shadowInstance = null;
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
    if (!this.isSideBarVisible || !this.shadowInstance?.hostElement) return;

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
    // Note: Shadow DOM doesn't need complex message handlers like iframes
    // Most communication is direct method calls since we're in the same context
  }

  private setupShadowEventListeners(): void {
    if (!this.shadowInstance) return;

    // Listen for events from shadow DOM components
    const handleShadowMessage = (event: CustomEvent) => {
      const message = event.detail;
      
      switch (message?.type) {
        case 'sol-close-sidebar':
        case 'sol-trigger-close':
          this.hide();
          break;
        default:
          // Handle other shadow DOM messages
          break;
      }
    };

    this.shadowInstance.hostElement.addEventListener('sol-shadow-message', handleShadowMessage as EventListener);
  }

  // Utility similar to AskBarController
  private detectColorScheme(): 'light' | 'dark' {
    try {
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