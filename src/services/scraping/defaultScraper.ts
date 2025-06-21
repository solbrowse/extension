import { ScrapedContent } from '@src/services/contentScraper';
import { PluginScraper } from './pluginScraperRegistry';
import { Readability } from '@mozilla/readability';

/**
 * Default scraper using Mozilla Readability
 * This will be used as the fallback when no specific plugin matches
 */

export const createDefaultReadabilityScraper = (): PluginScraper => {
  return (document: Document, url: string): ScrapedContent => {
    try {
      
      // Clone document for Readability (it modifies the DOM)
      const clonedDoc = document.cloneNode(true) as Document;
      
      // Initialize Readability
      const reader = new Readability(clonedDoc);
      const article = reader.parse();
      
      if (article) {
        // Successfully parsed with Readability
        const text = article.textContent || '';
        const title = article.title || document.title;
        
        return {
          text,
          markdown: `# ${title}\n\n${text}`,
          title,
          excerpt: article.excerpt || text.substring(0, 200) + (text.length > 200 ? '...' : ''),
          metadata: {
            hostname: new URL(url).hostname,
            url,
            title,
            extractionMethod: 'readability',
            hasContent: text.length > 0,
            wordCount: text.split(/\s+/).length,
            contentLength: text.length,
            readingTimeMinutes: Math.ceil(text.split(/\s+/).length / 200),
            byline: article.byline,
            dir: article.dir,
            lang: article.lang,
            shadowDOMCount: 0,
            iframeCount: document.querySelectorAll('iframe').length,
            readabilityScore: 0.7, // Readability should be decent
            contentDensity: 0.7,
            isArticle: true,
            publishedTime: null,
            siteName: article.siteName,
            fallbackUsed: false,
            debugInfo: {
              originalLength: document.body.textContent?.length || 0,
              cleanedLength: text.length,
              removedElements: [],
              contentSelectors: ['readability-parsed'],
              imageCount: (article.content.match(/<img/g) || []).length,
              linkCount: (article.content.match(/<a/g) || []).length,
              paragraphCount: text.split('\n\n').length,
            }
          }
        };
      } else {
        // Readability failed, fallback to basic extraction
        console.warn('Sol DefaultScraper: Readability failed, using fallback extraction');
        return createFallbackScraper()(document, url);
      }
      
    } catch (error) {
      console.warn('Sol DefaultScraper: Readability not available or failed, using fallback:', error);
      return createFallbackScraper()(document, url);
    }
  };
};

/**
 * Fallback scraper when Readability is not available or fails
 * Uses basic DOM extraction techniques
 */
export const createFallbackScraper = (): PluginScraper => {
  return (document: Document, url: string): ScrapedContent => {
    try {
      const title = document.title;
      
      // Try to find main content using common selectors
      const contentSelectors = [
        'main',
        'article',
        '[role="main"]',
        '.content',
        '.post-content',
        '.entry-content',
        '.article-content',
        '#content',
        '#main',
        '.main'
      ];
      
      let contentElement: Element | null = null;
      let usedSelector = '';
      
      for (const selector of contentSelectors) {
        contentElement = document.querySelector(selector);
        if (contentElement && contentElement.textContent && contentElement.textContent.trim().length > 200) {
          usedSelector = selector;
          break;
        }
      }
      
      // Fallback to body if no main content found
      if (!contentElement) {
        contentElement = document.body;
        usedSelector = 'body';
      }
      
      // Extract text and clean it up
      let text = contentElement.textContent || '';
      
      // Basic cleanup
      text = text
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/\n\s*\n/g, '\n\n') // Normalize line breaks
        .trim();
      
      // Try to extract some metadata
      const metaDescription = document.querySelector('meta[name="description"]')?.getAttribute('content');
      const excerpt = metaDescription || text.substring(0, 200) + (text.length > 200 ? '...' : '');
      
      return {
        text,
        markdown: `# ${title}\n\n${text}`,
        title,
        excerpt,
        metadata: {
          hostname: new URL(url).hostname,
          url,
          title,
          extractionMethod: 'fallback',
          hasContent: text.length > 0,
          wordCount: text.split(/\s+/).length,
          contentLength: text.length,
          readingTimeMinutes: Math.ceil(text.split(/\s+/).length / 200),
          byline: null,
          dir: null,
          lang: document.documentElement.lang || null,
          shadowDOMCount: document.querySelectorAll('*').length - document.querySelectorAll('*:not([shadowRoot])').length,
          iframeCount: document.querySelectorAll('iframe').length,
          readabilityScore: 0.5, // Unknown quality
          contentDensity: 0.5,
          isArticle: false, // Unknown
          publishedTime: null,
          siteName: null,
          fallbackUsed: true,
          debugInfo: {
            originalLength: document.body.textContent?.length || 0,
            cleanedLength: text.length,
            removedElements: [],
            contentSelectors: [usedSelector],
            imageCount: document.querySelectorAll('img').length,
            linkCount: document.querySelectorAll('a').length,
            paragraphCount: text.split('\n\n').length,
          }
        }
      };
      
    } catch (error) {
      console.error('Sol FallbackScraper: Error extracting content:', error);
      
      // Last resort - just get all text
      const text = document.body.textContent || '';
      return {
        text,
        markdown: `# ${document.title}\n\n${text}`,
        title: document.title,
        excerpt: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
        metadata: {
          hostname: new URL(url).hostname,
          url,
          title: document.title,
          extractionMethod: 'emergency-fallback',
          hasContent: text.length > 0,
          wordCount: text.split(/\s+/).length,
          contentLength: text.length,
          readingTimeMinutes: Math.ceil(text.split(/\s+/).length / 200),
          byline: null,
          dir: null,
          lang: null,
          shadowDOMCount: 0,
          iframeCount: 0,
          readabilityScore: 0.1,
          contentDensity: 0.1,
          isArticle: false,
          publishedTime: null,
          siteName: null,
          fallbackUsed: true,
          debugInfo: {
            originalLength: text.length,
            cleanedLength: text.length,
            removedElements: [],
            contentSelectors: ['body'],
            imageCount: 0,
            linkCount: 0,
            paragraphCount: 1,
          }
        }
      };
    }
  };
}; 