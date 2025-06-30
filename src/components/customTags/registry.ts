import { TagPlugin } from './TagPlugin';

class TagPluginRegistry {
  private plugins: Map<string, TagPlugin> = new Map();
  private static instance: TagPluginRegistry;

  private constructor() {}

  static getInstance(): TagPluginRegistry {
    if (!this.instance) {
      this.instance = new TagPluginRegistry();
    }
    return this.instance;
  }

  register(plugin: TagPlugin): void {
    this.plugins.set(plugin.tagName.toLowerCase(), plugin);
  }

  get(tagName: string): TagPlugin | undefined {
    return this.plugins.get(tagName.toLowerCase());
  }

  list(): TagPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export default TagPluginRegistry.getInstance();