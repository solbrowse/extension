import { ScrapedContent } from '@src/services/scraping/scrape';
import youtube from './plugins/youtube';

// Plugin scraper function type
export type PluginScraper = (document: Document, url: string) => ScrapedContent | Promise<ScrapedContent>;

// Plugin metadata
export interface ScraperPlugin {
  name: string;
  version: string;
  description: string;
  hostPatterns: RegExp[];
  scraper: PluginScraper;
  priority?: number; // Higher priority = checked first
}

class PluginScraperRegistry {
  private plugins: ScraperPlugin[] = [];
  private defaultScraper: PluginScraper | null = null;

  constructor() {
    this.registerBuiltinPlugins();
  }

  /**
   * Register a scraper plugin
   */
  registerPlugin(plugin: ScraperPlugin): void {
    // Remove existing plugin with same name
    this.plugins = this.plugins.filter(p => p.name !== plugin.name);
    
    // Insert by priority (higher priority first)
    const priority = plugin.priority || 0;
    const insertIndex = this.plugins.findIndex(p => (p.priority || 0) < priority);
    
    if (insertIndex === -1) {
      this.plugins.push(plugin);
    } else {
      this.plugins.splice(insertIndex, 0, plugin);
    }

    console.log(`Sol PluginRegistry: Registered ${plugin.name} v${plugin.version}`);
  }

  /**
   * Register a simple scraper by host pattern
   */
  registerScraper(hostPattern: RegExp, scraper: PluginScraper, name?: string): void {
    this.registerPlugin({
      name: name || `Custom scraper for ${hostPattern.source}`,
      version: '1.0.0',
      description: `Custom scraper for ${hostPattern.source}`,
      hostPatterns: [hostPattern],
      scraper
    });
  }

  /**
   * Set the default fallback scraper
   */
  setDefaultScraper(scraper: PluginScraper): void {
    this.defaultScraper = scraper;
  }

  /**
   * Get the best scraper for a given URL
   */
  getScraperFor(url: string): PluginScraper {
    // Try plugins in priority order
    for (const plugin of this.plugins) {
      for (const pattern of plugin.hostPatterns) {
        if (pattern.test(url)) {
          console.log(`Sol PluginRegistry: Using ${plugin.name} for ${url}`);
          return plugin.scraper;
        }
      }
    }

    // Fallback to default scraper
    if (this.defaultScraper) {
      console.log(`Sol PluginRegistry: Using default scraper for ${url}`);
      return this.defaultScraper;
    }

    throw new Error('No scraper available and no default scraper set');
  }

  /**
   * List all registered plugins
   */
  listPlugins(): ScraperPlugin[] {
    return [...this.plugins];
  }

  /**
   * Remove a plugin by name
   */
  unregisterPlugin(name: string): boolean {
    const initialLength = this.plugins.length;
    this.plugins = this.plugins.filter(p => p.name !== name);
    return this.plugins.length < initialLength;
  }

  /**
   * Register built-in plugins for common sites
   */
  private registerBuiltinPlugins(): void {
    [youtube].forEach(p => this.registerPlugin(p));
  }
}

// Singleton instance
export const pluginScraperRegistry = new PluginScraperRegistry();

// Convenience exports
export const registerScraper = pluginScraperRegistry.registerScraper.bind(pluginScraperRegistry);
export const registerPlugin = pluginScraperRegistry.registerPlugin.bind(pluginScraperRegistry);
export const getScraperFor = pluginScraperRegistry.getScraperFor.bind(pluginScraperRegistry);
export const setDefaultScraper = pluginScraperRegistry.setDefaultScraper.bind(pluginScraperRegistry); 