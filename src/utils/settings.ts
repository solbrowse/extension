import storage, { StorageData, DEFAULT_STORAGE } from '../services/storage';

// ============================================================================
// SETTINGS UTILS (was SettingsService)
// ============================================================================

export class SettingsUtil {
  private static instance: SettingsUtil;

  private constructor() {}

  static getInstance(): SettingsUtil {
    if (!this.instance) {
      this.instance = new SettingsUtil();
    }
    return this.instance;
  }

  // Convenience methods
  async getApiKey(): Promise<string> {
    const data = await storage.get();
    return data.apiKey;
  }

  async setApiKey(apiKey: string): Promise<void> {
    await storage.set({ apiKey: apiKey.trim() });
  }

  async getProvider(): Promise<string> {
    const data = await storage.get();
    return data.provider;
  }

  async setProvider(provider: string): Promise<void> {
    await storage.set({ provider });
  }

  async getModel(): Promise<string> {
    const data = await storage.get();
    return data.model;
  }

  async setModel(model: string): Promise<void> {
    await storage.set({ model });
  }

  async getCustomEndpoint(): Promise<string | undefined> {
    const data = await storage.get();
    return data.customEndpoint;
  }

  async setCustomEndpoint(customEndpoint: string): Promise<void> {
    await storage.set({ customEndpoint });
  }

  async getDebug(): Promise<boolean> {
    const data = await storage.get();
    return data.debug;
  }

  async setDebug(debug: boolean): Promise<void> {
    await storage.set({ debug });
  }

  async getFeatures(): Promise<StorageData['features']> {
    const data = await storage.get();
    return data.features;
  }

  async setFeatures(features: Partial<StorageData['features']>): Promise<void> {
    const currentData = await storage.get();
    await storage.set({
      features: { ...currentData.features, ...features }
    });
  }

  // Schema validation
  async needsSchemaReset(): Promise<boolean> {
    try {
      const stored = await storage.get();
      if (!stored.version || stored.version !== DEFAULT_STORAGE.version) {
        return true;
      }
      const rawStored = stored as any;
      return !!(rawStored.features && rawStored.features.aiSearch && !rawStored.features.askBar);
    } catch {
      return true;
    }
  }

  async resetToDefaults(): Promise<void> {
    await storage.reset();
  }

  // Bulk operations
  async getAll(): Promise<StorageData> {
    return await storage.get();
  }

  async setAll(data: Partial<StorageData>): Promise<void> {
    await storage.set(data);
  }
}

// Singleton export
const settingsUtil = SettingsUtil.getInstance();
export default settingsUtil; 