import '@src/utils/logger';
import browser from 'webextension-polyfill';
import { ContentPortMsg, UiPortMsg, PORT_NAMES } from '@src/types/messaging';

type PortMessageHandler<T> = (message: T, port: browser.Runtime.Port) => void;
type RequestHandler<T, R> = (message: T, port: browser.Runtime.Port) => Promise<R> | R;

export class PortManager {
  private static instance: PortManager;
  private contentPorts = new Map<number, browser.Runtime.Port>(); // tabId -> port
  private uiPorts = new Set<browser.Runtime.Port>();
  private contentHandlers = new Map<string, PortMessageHandler<any>>();
  private uiHandlers = new Map<string, PortMessageHandler<any>>();
  private requestHandlers = new Map<string, RequestHandler<any, any>>();
  


  private constructor() {
    this.setupPortListeners();
  }

  static getInstance(): PortManager {
    if (!this.instance) {
      this.instance = new PortManager();
    }
    return this.instance;
  }

  // Content Script Registration
  addContentHandler<T extends ContentPortMsg>(
    type: T['type'], 
    handler: PortMessageHandler<T>
  ): void {
    this.contentHandlers.set(type, handler);
  }

  // UI Registration
  addUiHandler<T extends UiPortMsg>(
    type: T['type'], 
    handler: PortMessageHandler<T>
  ): void {
    this.uiHandlers.set(type, handler);
  }

  // Request-Response Registration (for UI → Background requests)
  addRequestHandler<T extends UiPortMsg, R extends UiPortMsg>(
    type: T['type'],
    handler: RequestHandler<T, R>
  ): void {
    this.requestHandlers.set(type, handler);
  }



  // Send message to specific content script
  sendToContentScript(tabId: number, message: any): boolean {
    const port = this.contentPorts.get(tabId);
    if (port) {
      try {
        port.postMessage(message);
        return true;
      } catch (error) {
        console.error(`Sol PortManager: Failed to send to content script ${tabId}:`, error);
        this.contentPorts.delete(tabId);
        return false;
      }
    }
    return false;
  }

  // Broadcast to all UI ports
  broadcastToUi(message: UiPortMsg): void {
    const disconnectedPorts: browser.Runtime.Port[] = [];
    
    this.uiPorts.forEach(port => {
      try {
        port.postMessage(message);
      } catch (error) {
        console.error('Sol PortManager: Failed to send to UI port:', error);
        disconnectedPorts.push(port);
      }
    });

    // Clean up disconnected ports
    disconnectedPorts.forEach(port => this.uiPorts.delete(port));
  }

  // Send to specific UI port (for request-response)
  sendToUiPort(port: browser.Runtime.Port, message: UiPortMsg): boolean {
    try {
      port.postMessage(message);
      return true;
    } catch (error) {
      console.error('Sol PortManager: Failed to send to specific UI port:', error);
      this.uiPorts.delete(port);
      return false;
    }
  }



  // Get active tab IDs
  getActiveTabIds(): number[] {
    return Array.from(this.contentPorts.keys());
  }

  // Get connected UI count
  getUiConnectionCount(): number {
    return this.uiPorts.size;
  }

  // Cleanup
  cleanup(): void {
    // Cleanup any remaining handlers if needed
  }

  private setupPortListeners(): void {
    browser.runtime.onConnect.addListener((port) => {
      console.log(`Sol PortManager: New connection on port ${port.name}`);

      if (port.name === PORT_NAMES.CONTENT_PORT) {
        this.handleContentPort(port);
      } else if (port.name === PORT_NAMES.UI_PORT) {
        this.handleUiPort(port);
      } else {
        console.warn(`Sol PortManager: Unknown port name: ${port.name}`);
        port.disconnect();
      }
    });
  }



  private handleContentPort(port: browser.Runtime.Port): void {
    // Extract tabId from sender
    const tabId = port.sender?.tab?.id;
    if (!tabId) {
      console.error('Sol PortManager: Content port without tab ID');
      port.disconnect();
      return;
    }

    // Store the port
    this.contentPorts.set(tabId, port);
    console.log(`Sol PortManager: Content script connected for tab ${tabId}`);

    // Handle messages
    port.onMessage.addListener((message: unknown) => {
      const typedMessage = message as ContentPortMsg;
      if (!typedMessage || typeof typedMessage !== 'object' || !typedMessage.type) {
        console.warn('Sol PortManager: Invalid content message format:', message);
        return;
      }

      const handler = this.contentHandlers.get(typedMessage.type);
      if (handler) {
        try {
          handler(typedMessage, port);
        } catch (error) {
          console.error(`Sol PortManager: Error in content handler for ${typedMessage.type}:`, error);
        }
      } else {
        console.warn(`Sol PortManager: No handler for content message type: ${typedMessage.type}`);
      }
    });

    // Handle disconnection
    port.onDisconnect.addListener(() => {
      console.log(`Sol PortManager: Content script disconnected for tab ${tabId}`);
      this.contentPorts.delete(tabId);
    });
  }

  private handleUiPort(port: browser.Runtime.Port): void {
    this.uiPorts.add(port);
    console.log(`Sol PortManager: UI connected (${this.uiPorts.size} total)`);

    // Handle messages
    port.onMessage.addListener(async (message: unknown) => {
      const typedMessage = message as UiPortMsg;
      if (!typedMessage || typeof typedMessage !== 'object' || !typedMessage.type) {
        console.warn('Sol PortManager: Invalid UI message format:', message);
        return;
      }

      // Check if it's a request that needs a response
      const requestHandler = this.requestHandlers.get(typedMessage.type);
      if (requestHandler) {
        try {
          const response = await requestHandler(typedMessage, port);
          if (response) {
            this.sendToUiPort(port, response);
          }
        } catch (error) {
          console.error(`Sol PortManager: Error in request handler for ${typedMessage.type}:`, error);
          // Send error response if possible
          if ('requestId' in typedMessage && typedMessage.requestId) {
            this.sendToUiPort(port, {
              type: 'LLM_ERROR',
              requestId: (typedMessage as any).requestId,
              error: `Request handler error: ${error instanceof Error ? error.message : 'Unknown error'}`
            } as UiPortMsg);
          }
        }
      } else {
        // Regular message handler
        const handler = this.uiHandlers.get(typedMessage.type);
        if (handler) {
          try {
            handler(typedMessage, port);
          } catch (error) {
            console.error(`Sol PortManager: Error in UI handler for ${typedMessage.type}:`, error);
          }
        } else {
          console.warn(`Sol PortManager: No handler for UI message type: ${typedMessage.type}`);
        }
      }
    });

    // Handle disconnection
    port.onDisconnect.addListener(() => {
      console.log(`Sol PortManager: UI disconnected (${this.uiPorts.size - 1} remaining)`);
      this.uiPorts.delete(port);
    });
  }
} 