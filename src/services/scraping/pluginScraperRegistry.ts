import { ScrapedContent } from '@src/services/contentScraper';

// Plugin scraper function type
export type PluginScraper = (document: Document, url: string) => ScrapedContent;

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
    // Google Docs plugin
    this.registerPlugin({
      name: 'Google Docs',
      version: '1.0.0',
      description: 'Enhanced scraper for Google Docs documents',
      hostPatterns: [/docs\.google\.com/],
      priority: 100,
      scraper: this.googleDocsScraper
    });

    // GitHub plugin
    this.registerPlugin({
      name: 'GitHub',
      version: '1.0.0', 
      description: 'Enhanced scraper for GitHub repositories and issues',
      hostPatterns: [/github\.com/],
      priority: 90,
      scraper: this.githubScraper
    });

    // Medium plugin
    this.registerPlugin({
      name: 'Medium',
      version: '1.0.0',
      description: 'Enhanced scraper for Medium articles',
      hostPatterns: [/medium\.com/, /\.medium\.com$/],
      priority: 80,
      scraper: this.mediumScraper
    });

    // Reddit plugin
    this.registerPlugin({
      name: 'Reddit',
      version: '1.0.0',
      description: 'Enhanced scraper for Reddit posts and comments',
      hostPatterns: [/reddit\.com/, /www\.reddit\.com/],
      priority: 80,
      scraper: this.redditScraper
    });

    // Wikipedia plugin
    this.registerPlugin({
      name: 'Wikipedia',
      version: '1.0.0',
      description: 'Enhanced scraper for Wikipedia articles',
      hostPatterns: [/wikipedia\.org/],
      priority: 70,
      scraper: this.wikipediaScraper
    });
  }

  /**
   * Google Docs scraper - extracts document content
   */
  private googleDocsScraper = (document: Document, url: string): ScrapedContent => {
    try {
      // Get document title
      const title = document.title.replace(' - Google Docs', '');

      // Extract content from Google Docs structure
      const pages = Array.from(document.querySelectorAll('.kix-page-content'))
        .map(page => {
          // Get text content and preserve some structure
          const content = page.textContent || '';
          return content.trim();
        })
        .filter(content => content.length > 0)
        .join('\n\n');

      // Fallback if no pages found
      const text = pages || document.body.textContent || '';

      return {
        text,
        markdown: `# ${title}\n\n${text}`,
        title,
        excerpt: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        metadata: {
          hostname: 'docs.google.com',
          url,
          title,
          extractionMethod: 'google-docs-plugin',
          hasContent: text.length > 0,
          wordCount: text.split(/\s+/).length,
          contentLength: text.length,
          readingTimeMinutes: Math.ceil(text.split(/\s+/).length / 200),
          byline: null,
          dir: null,
          lang: document.documentElement.lang || null,
          shadowDOMCount: 0,
          iframeCount: 0,
          readabilityScore: 0.8, // Google Docs is inherently readable
          contentDensity: 0.9,
          isArticle: true,
          publishedTime: null,
          siteName: 'Google Docs',
          fallbackUsed: false,
          debugInfo: {
            originalLength: text.length,
            cleanedLength: text.length,
            removedElements: [],
            contentSelectors: ['.kix-page-content'],
            imageCount: 0,
            linkCount: 0,
            paragraphCount: text.split('\n\n').length
          }
        }
      };
    } catch (error) {
      console.error('Sol GoogleDocs Scraper: Error extracting content:', error);
      throw error;
    }
  };

  /**
   * GitHub scraper - extracts repository info, READMEs, issues, etc.
   */
  private githubScraper = (document: Document, url: string): ScrapedContent => {
    try {
      const title = document.title;
      let text = '';
      let markdown = '';

      // Repository README
      const readme = document.querySelector('[data-testid="readme"]') || 
                    document.querySelector('#readme');
      if (readme) {
        text = readme.textContent || '';
        markdown = `# ${title}\n\n${text}`;
      }
      
      // Issue or PR content
      const issueBody = document.querySelector('.comment-body');
      if (issueBody) {
        text = issueBody.textContent || '';
        markdown = `# ${title}\n\n${text}`;
      }

      // File content (if viewing a file)
      const fileContent = document.querySelector('.blob-wrapper .blob-code-inner');
      if (fileContent) {
        text = fileContent.textContent || '';
        markdown = `# ${title}\n\n\`\`\`\n${text}\n\`\`\``;
      }

      // Fallback to general content
      if (!text) {
        text = document.body.textContent || '';
        markdown = `# ${title}\n\n${text}`;
      }

      return {
        text,
        markdown,
        title,
        excerpt: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        metadata: {
          hostname: 'github.com',
          url,
          title,
          extractionMethod: 'github-plugin',
          hasContent: text.length > 0,
          wordCount: text.split(/\s+/).length,
          contentLength: text.length,
          readingTimeMinutes: Math.ceil(text.split(/\s+/).length / 200),
          byline: null,
          dir: null,
          lang: document.documentElement.lang || null,
          shadowDOMCount: 0,
          iframeCount: 0,
          readabilityScore: 0.8,
          contentDensity: 0.8,
          isArticle: url.includes('/issues/') || url.includes('/pull/'),
          publishedTime: null,
          siteName: 'GitHub',
          fallbackUsed: false,
          debugInfo: {
            originalLength: text.length,
            cleanedLength: text.length,
            removedElements: [],
            contentSelectors: ['[data-testid="readme"]', '.comment-body', '.blob-code-inner'],
            imageCount: 0,
            linkCount: 0,
            paragraphCount: text.split('\n').length
          }
        }
      };
    } catch (error) {
      console.error('Sol GitHub Scraper: Error extracting content:', error);
      throw error;
    }
  };

  /**
   * Medium scraper - extracts article content
   */
  private mediumScraper = (document: Document, url: string): ScrapedContent => {
    try {
      const title = document.querySelector('h1')?.textContent || document.title;
      
      // Medium article content
      const article = document.querySelector('article') ||
                     document.querySelector('[data-testid="storyContent"]') ||
                     document.querySelector('.postArticle-content');
      
      const text = article?.textContent || document.body.textContent || '';
      const markdown = `# ${title}\n\n${text}`;

      return {
        text,
        markdown,
        title,
        excerpt: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        metadata: {
          hostname: new URL(url).hostname,
          url,
          title,
          extractionMethod: 'medium-plugin',
          hasContent: text.length > 0,
          wordCount: text.split(/\s+/).length,
          contentLength: text.length,
          readingTimeMinutes: Math.ceil(text.split(/\s+/).length / 200),
          byline: document.querySelector('[data-testid="authorName"]')?.textContent || null,
          dir: null,
          lang: document.documentElement.lang || null,
          shadowDOMCount: 0,
          iframeCount: 0,
          readabilityScore: 0.9,
          contentDensity: 0.8,
          isArticle: true,
          publishedTime: null,
          siteName: 'Medium',
          fallbackUsed: false,
          debugInfo: {
            originalLength: text.length,
            cleanedLength: text.length,
            removedElements: [],
            contentSelectors: ['article', '[data-testid="storyContent"]'],
            imageCount: 0,
            linkCount: 0,
            paragraphCount: text.split('\n\n').length
          }
        }
      };
    } catch (error) {
      console.error('Sol Medium Scraper: Error extracting content:', error);
      throw error;
    }
  };

  /**
   * Reddit scraper - extracts post and comments
   */
  private redditScraper = (document: Document, url: string): ScrapedContent => {
    try {
      const title = document.querySelector('[data-testid="post-content"] h1')?.textContent || 
                   document.title;
      
      // Post content
      const postText = document.querySelector('[data-testid="post-content"] [data-click-id="text"]')?.textContent || '';
      
      // Comments (limit to top-level)
      const comments = Array.from(document.querySelectorAll('[data-testid="comment"]'))
        .slice(0, 10) // Limit to first 10 comments
        .map(comment => comment.textContent?.trim())
        .filter(text => text && text.length > 0)
        .join('\n\n---\n\n');

      const text = [postText, comments].filter(Boolean).join('\n\n--- Comments ---\n\n');
      const markdown = `# ${title}\n\n${postText}\n\n## Comments\n\n${comments}`;

      return {
        text,
        markdown,
        title,
        excerpt: postText.substring(0, 200) + (postText.length > 200 ? '...' : ''),
        metadata: {
          hostname: 'reddit.com',
          url,
          title,
          extractionMethod: 'reddit-plugin',
          hasContent: text.length > 0,
          wordCount: text.split(/\s+/).length,
          contentLength: text.length,
          readingTimeMinutes: Math.ceil(text.split(/\s+/).length / 200),
          byline: null,
          dir: null,
          lang: document.documentElement.lang || null,
          shadowDOMCount: 0,
          iframeCount: 0,
          readabilityScore: 0.7,
          contentDensity: 0.6,
          isArticle: true,
          publishedTime: null,
          siteName: 'Reddit',
          fallbackUsed: false,
          debugInfo: {
            originalLength: text.length,
            cleanedLength: text.length,
            removedElements: [],
            contentSelectors: ['[data-testid="post-content"]', '[data-testid="comment"]'],
            imageCount: 0,
            linkCount: 0,
            paragraphCount: text.split('\n').length
          }
        }
      };
    } catch (error) {
      console.error('Sol Reddit Scraper: Error extracting content:', error);
      throw error;
    }
  };

  /**
   * Wikipedia scraper - extracts article content
   */
  private wikipediaScraper = (document: Document, url: string): ScrapedContent => {
    try {
      const title = document.querySelector('#firstHeading')?.textContent || document.title;
      
      // Wikipedia main content
      const content = document.querySelector('#mw-content-text');
      const text = content?.textContent || document.body.textContent || '';
      
      // Clean up common Wikipedia noise
      const cleanText = text
        .replace(/\[edit\]/g, '')
        .replace(/\[\d+\]/g, '') // Remove citation numbers
        .replace(/\s+/g, ' ')
        .trim();

      const markdown = `# ${title}\n\n${cleanText}`;

      return {
        text: cleanText,
        markdown,
        title,
        excerpt: cleanText.substring(0, 200) + (cleanText.length > 200 ? '...' : ''),
        metadata: {
          hostname: new URL(url).hostname,
          url,
          title,
          extractionMethod: 'wikipedia-plugin',
          hasContent: cleanText.length > 0,
          wordCount: cleanText.split(/\s+/).length,
          contentLength: cleanText.length,
          readingTimeMinutes: Math.ceil(cleanText.split(/\s+/).length / 200),
          byline: null,
          dir: null,
          lang: document.documentElement.lang || null,
          shadowDOMCount: 0,
          iframeCount: 0,
          readabilityScore: 0.9,
          contentDensity: 0.8,
          isArticle: true,
          publishedTime: null,
          siteName: 'Wikipedia',
          fallbackUsed: false,
          debugInfo: {
            originalLength: text.length,
            cleanedLength: cleanText.length,
            removedElements: ['[edit]', 'citation numbers'],
            contentSelectors: ['#mw-content-text'],
            imageCount: 0,
            linkCount: 0,
            paragraphCount: cleanText.split('\n\n').length
          }
        }
      };
    } catch (error) {
      console.error('Sol Wikipedia Scraper: Error extracting content:', error);
      throw error;
    }
  };
}

// Singleton instance
export const pluginScraperRegistry = new PluginScraperRegistry();

// Convenience exports
export const registerScraper = pluginScraperRegistry.registerScraper.bind(pluginScraperRegistry);
export const registerPlugin = pluginScraperRegistry.registerPlugin.bind(pluginScraperRegistry);
export const getScraperFor = pluginScraperRegistry.getScraperFor.bind(pluginScraperRegistry);
export const setDefaultScraper = pluginScraperRegistry.setDefaultScraper.bind(pluginScraperRegistry); 