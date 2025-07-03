import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import AskBar from '@src/pages/askbar/AskBar';
import SideBar from '@src/pages/sidebar/SideBar';

// Import styles
import '@src/assets/styles/chat.css';

interface ShadowRenderConfig {
  containerId: string;
  position?: string;
  colorScheme?: 'light' | 'dark';
  existingConversation?: any;
}

interface ShadowRenderInstance {
  root: Root;
  unmount: () => void;
  updateProps: (newProps: any) => void;
}

export class ShadowRenderer {
  private static instances = new Map<string, ShadowRenderInstance>();

  static renderAskBar(
    container: HTMLElement, 
    config: ShadowRenderConfig
  ): ShadowRenderInstance {
    const { containerId } = config;
    
    // Clean up existing instance
    if (this.instances.has(containerId)) {
      this.instances.get(containerId)?.unmount();
    }

    // Create React root
    const root = createRoot(container);
    
    // Render AskBar
    const renderApp = (props: any = {}) => {
      root.render(
        <div className="shadow-container sol-ask-bar">
          <AskBar {...props} />
        </div>
      );
    };

    // Initial render
    renderApp(config);

    const instance: ShadowRenderInstance = {
      root,
      unmount: () => {
        root.unmount();
        this.instances.delete(containerId);
      },
      updateProps: (newProps: any) => renderApp({ ...config, ...newProps })
    };

    this.instances.set(containerId, instance);
    return instance;
  }

  static renderSideBar(
    container: HTMLElement, 
    config: ShadowRenderConfig
  ): ShadowRenderInstance {
    const { containerId } = config;
    
    // Clean up existing instance
    if (this.instances.has(containerId)) {
      this.instances.get(containerId)?.unmount();
    }

    // Create React root
    const root = createRoot(container);
    
    // Render SideBar
    const renderApp = (props: any = {}) => {
      root.render(
        <div className="shadow-container sol-sidebar">
          <SideBar {...props} />
        </div>
      );
    };

    // Initial render
    renderApp(config);

    const instance: ShadowRenderInstance = {
      root,
      unmount: () => {
        root.unmount();
        this.instances.delete(containerId);
      },
      updateProps: (newProps: any) => renderApp({ ...config, ...newProps })
    };

    this.instances.set(containerId, instance);
    return instance;
  }

  static getInstance(containerId: string): ShadowRenderInstance | undefined {
    return this.instances.get(containerId);
  }

  static unmountAll(): void {
    this.instances.forEach(instance => instance.unmount());
    this.instances.clear();
  }
} 