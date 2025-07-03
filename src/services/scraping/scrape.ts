import { Readability } from '@mozilla/readability';
import { pluginScraperRegistry, getScraperFor, setDefaultScraper } from './pluginRegistry';
import { createDefaultReadabilityScraper, createFallbackScraper } from './default';
import TurndownService from 'turndown';

export interface TranscriptCue {
  text: string;
  duration: number; // seconds
  offset: number; // seconds from start
  lang?: string;
}

export interface ScrapedContent {
  text: string;
  markdown: string;
  title: string;
  excerpt: string;
  metadata: {
    hostname: string;
    url: string;
    title: string;
    byline: string | null;
    dir: string | null;
    lang: string | null;
    contentLength: number;
    wordCount: number;
    readingTimeMinutes: number;
    hasContent: boolean;
    extractionMethod: string;
    shadowDOMCount: number;
    iframeCount: number;
    readabilityScore: number;
    contentDensity: number;
    isArticle: boolean;
    publishedTime: string | null;
    siteName: string | null;
    fallbackUsed: boolean;
    debugInfo: {
      originalLength: number;
      cleanedLength: number;
      removedElements: string[];
      contentSelectors: string[];
      imageCount: number;
      linkCount: number;
      paragraphCount: number;
    };
  };
  comments?: string[];
  transcriptCues?: TranscriptCue[];
}

export class ContentScraperService {
  private static instance: ContentScraperService;
  private turndownService: TurndownService;

  private constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      hr: '---',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      strongDelimiter: '**',
      linkStyle: 'inlined'
    });

    // Configure for LLM-friendly output
    this.turndownService.remove(['script', 'style', 'nav', 'footer', 'aside']);
    
    // Handle images better
    this.turndownService.addRule('images', {
      filter: 'img',
      replacement: (_content: any, node: any) => {
        const img = node as HTMLImageElement;
        const alt = img.alt || '';
        const src = img.src || '';
        return alt ? `![${alt}](${src})` : '';
      }
    });
  }

  public static getInstance(): ContentScraperService {
    if (!ContentScraperService.instance) {
      ContentScraperService.instance = new ContentScraperService();
      ContentScraperService.instance.initializePluginSystem();
    }
    return ContentScraperService.instance;
  }

  private initializePluginSystem(): void {
    try {
      // Set default scraper to use Readability with fallback
      setDefaultScraper(createDefaultReadabilityScraper());
      console.log('Sol ContentScrapingService: Plugin system initialized with built-in scrapers');
    } catch (error) {
      console.warn('Sol ContentScrapingService: Failed to initialize plugin system, using fallback:', error);
      setDefaultScraper(createFallbackScraper());
    }
  }

  private extractMetadata(doc: Document): {
    publishedTime: string | null;
    siteName: string | null;
    byline: string | null;
  } {
    const getMeta = (selector: string): string | null => {
      const meta = doc.querySelector(selector);
      return meta?.getAttribute('content') || null;
    };

    return {
      publishedTime: getMeta('meta[property="article:published_time"]') ||
                    getMeta('meta[name="datePublished"]') ||
                    getMeta('meta[name="pubdate"]'),
      siteName: getMeta('meta[property="og:site_name"]') ||
                getMeta('meta[name="application-name"]'),
      byline: getMeta('meta[name="author"]') ||
              getMeta('meta[property="article:author"]')
    };
  }

  private calculateReadabilityScore(text: string): number {
    if (!text || text.length < 100) return 0;
    
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    if (sentences.length === 0 || words.length === 0) return 0;
    
    // Simple Flesch Reading Ease approximation
    const avgSentenceLength = words.length / sentences.length;
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;
    
    return Math.max(0, Math.min(100, 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgWordLength / 2)));
  }

  private extractFromShadowDOM(): { text: string; count: number } {
    let text = '';
    let count = 0;
    
    const findShadowHosts = (element: Element) => {
      if ((element as HTMLElement).shadowRoot) {
        count++;
        const shadowText = (element as HTMLElement).shadowRoot!.textContent || '';
        if (shadowText.length > 50) {
          text += shadowText + '\n\n';
        }
      }
      
      Array.from(element.children).forEach(findShadowHosts);
    };
    
    findShadowHosts(document.body);
    return { text: text.trim(), count };
  }

  private extractFromIframes(): { text: string; count: number } {
    let text = '';
    let count = 0;
    
    const iframes = Array.from(document.querySelectorAll('iframe'));
    
    for (const iframe of iframes) {
      try {
        const doc = (iframe as HTMLIFrameElement).contentDocument;
        if (doc?.body) {
          const iframeText = doc.body.textContent || '';
          if (iframeText.length > 50) {
            text += iframeText + '\n\n';
            count++;
          }
        }
      } catch (e) {
        // Cross-origin, skip silently
      }
    }
    
    return { text: text.trim(), count };
  }

  private createFallbackExtraction(): ScrapedContent {
    // Enhanced fallback: better heuristics for homepages and general content
    const unwantedSelectors = [
      'script', 'style', 'nav', 'footer', 'aside', 'header',
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
      '.ad', '.advertisement', '.social', '.share', '.comments',
      '.sidebar', '.widget', '.popup', '.modal', '.cookies',
      '.newsletter', '.subscription', '.promo', '.banner'
    ];

        // Hide shadow DOM containers before cloning to exclude extension content
    const solContainer = document.querySelector('sol-overlay-container') as HTMLElement;
    const originalDisplay = solContainer?.style.display;
    if (solContainer) {
      solContainer.style.display = 'none';
    }

    const body = document.body.cloneNode(true) as HTMLElement;
    
    // Restore shadow container visibility
    if (solContainer && originalDisplay !== undefined) {
      solContainer.style.display = originalDisplay;
    }
    
    // Remove all iframes and extension elements
    const iframes = body.querySelectorAll('iframe');
    iframes.forEach(iframe => iframe.remove());
    
    const extensionElements = body.querySelectorAll('[data-sol-extension], [id*="sol-"], [class*="sol-"]');
    extensionElements.forEach(el => el.remove());
    
    // Remove unwanted elements
    unwantedSelectors.forEach(selector => {
      body.querySelectorAll(selector).forEach(el => el.remove());
    });

    // Find best content containers (multiple for homepages)
    const candidates = body.querySelectorAll('main, article, .content, .post, .story, [role="main"], .articles, .news, .headlines, section, div');
    let bestElements: HTMLElement[] = [];
    
    const elementScores: { element: HTMLElement; score: number; text: string }[] = [];

    for (const candidate of candidates) {
      const text = candidate.textContent || '';
      const paragraphs = candidate.querySelectorAll('p').length;
      const headings = candidate.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
      const links = candidate.querySelectorAll('a').length;
      const images = candidate.querySelectorAll('img').length;
      const listItems = candidate.querySelectorAll('li').length;
      
      // Better scoring for homepage content
      const textLength = text.length;
      const linkDensity = textLength > 0 ? links / (textLength / 100) : 100;
      const contentDensity = (paragraphs + headings + listItems) / Math.max(textLength / 500, 1);
      
      const score = (textLength * 0.3) + 
                   (paragraphs * 25) + 
                   (headings * 40) + 
                   (listItems * 10) + 
                   (images * 5) - 
                   (linkDensity * 15);
      
      if (score > 50 && textLength > 50) { // Lower threshold for homepages
        elementScores.push({ element: candidate as HTMLElement, score, text });
      }
    }

    // Sort by score and take top candidates
    elementScores.sort((a, b) => b.score - a.score);
    bestElements = elementScores.slice(0, 3).map(item => item.element);
    
    // If no good candidates, use body
    if (bestElements.length === 0) {
      bestElements = [body];
    }

    // Combine content from all best elements
    const allTexts = bestElements.map(el => (el.textContent || '').replace(/\s+/g, ' ').trim()).filter(t => t.length > 20);
    const allHtml = bestElements.map(el => el.innerHTML || '').join('\n\n');
    
    const text = allTexts.join('\n\n').trim();
    const markdown = this.turndownService.turndown(allHtml);
    const words = text.split(/\s+/).filter((w: string) => w.length > 0);

    return {
      text,
      markdown,
      title: document.title || '',
      excerpt: text.slice(0, 200) + (text.length > 200 ? '...' : ''),
      metadata: {
        hostname: window.location.hostname,
        url: window.location.href,
        title: document.title || '',
        byline: null,
        dir: document.documentElement.dir || null,
        lang: document.documentElement.lang || null,
        contentLength: text.length,
        wordCount: words.length,
        readingTimeMinutes: Math.max(1, Math.ceil(words.length / 200)),
        hasContent: text.length > 100,
        extractionMethod: 'fallback-heuristic',
        shadowDOMCount: 0,
        iframeCount: 0,
        readabilityScore: this.calculateReadabilityScore(text),
        contentDensity: text.length / (document.body.innerHTML?.length || 1),
        isArticle: false,
        publishedTime: null,
        siteName: null,
        fallbackUsed: true,
        debugInfo: {
          originalLength: document.body.innerHTML?.length || 0,
          cleanedLength: text.length,
          removedElements: unwantedSelectors,
          contentSelectors: ['enhanced-heuristic'],
          imageCount: bestElements.reduce((sum, el) => sum + el.querySelectorAll('img').length, 0),
          linkCount: bestElements.reduce((sum, el) => sum + el.querySelectorAll('a').length, 0),
          paragraphCount: bestElements.reduce((sum, el) => sum + el.querySelectorAll('p').length, 0),
        }
      },
      comments: [],
      transcriptCues: []
    };
  }

  public async scrapePageContent(): Promise<ScrapedContent> {
    try {
      // Wait for page to be ready
      if (document.readyState !== 'complete') {
        await new Promise<void>(resolve => {
          window.addEventListener('load', () => resolve(), { once: true });
        });
      }

      // YouTube-specific waiting to prevent constant re-scraping with visual impact
      if (window.location.hostname.includes('youtube.com')) {
        console.log('Sol ContentScraper: YouTube detected, waiting for page stability...');
        
        // Wait for YouTube page to be fully ready
        await this.waitForYouTubePageReady();
        
        // Additional settling time to prevent constant UI interactions
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Remove shadow DOM content BEFORE cloning to prevent extension content inclusion
      // Temporarily hide our extension shadow containers to exclude them from content extraction
      const solContainer = document.querySelector('sol-overlay-container') as HTMLElement;
      const originalDisplay = solContainer?.style.display;
      if (solContainer) {
        solContainer.style.display = 'none';
      }

      // Clone document to avoid mutations (shadow DOM content now excluded)
      const doc = document.cloneNode(true) as Document;
      
      // Restore shadow container visibility
      if (solContainer && originalDisplay !== undefined) {
        solContainer.style.display = originalDisplay;
      }
      
      // Remove any remaining iframe elements and extension content
      const iframes = doc.querySelectorAll('iframe');
      iframes.forEach(iframe => iframe.remove());
      
      const extensionElements = doc.querySelectorAll('[data-sol-extension], [id*="sol-"], [class*="sol-"]');
      extensionElements.forEach(el => el.remove());
      const originalLength = doc.body.innerHTML?.length || 0;

      // NEW: Try plugin-based scraping first
      try {
        const scraper = getScraperFor(window.location.href);
        const result = await Promise.resolve(scraper(doc, window.location.href));
        console.log(`Sol ContentScraper: Used plugin scraper, extracted ${result.text.length} chars`);
        return result;
      } catch (pluginError) {
        console.warn('Sol ContentScraper: Plugin scraper failed, falling back to Readability:', pluginError);
      }

      // Extract metadata for fallback
      const metadata = this.extractMetadata(doc);

      // Fallback to Mozilla Readability  
      const reader = new Readability(doc, {
        charThreshold: 500, // Higher threshold for better article detection
        debug: false,
        // Additional options to avoid iframe content
        classesToPreserve: ['article', 'content', 'main'],
        keepClasses: false
      });

      const article = reader.parse();

      // Check if Readability succeeded with meaningful content (article-like)
      if (article?.textContent && article.textContent.length > 500) {
        // Success! Process with Readability
        const htmlContent = article.content || '';
        const textContent = article.textContent;
        const markdown = this.turndownService.turndown(htmlContent);

        // Extract additional content from shadow DOM and iframes
        const shadowData = this.extractFromShadowDOM();
        const iframeData = this.extractFromIframes();

        // Combine all content
        const allTexts = [textContent, shadowData.text, iframeData.text].filter(t => t.length > 20);
        const combinedText = allTexts.join('\n\n').trim();
        const combinedMarkdown = [markdown, shadowData.text, iframeData.text].filter(t => t.length > 20).join('\n\n').trim();

        const words = combinedText.split(/\s+/).filter((w: string) => w.length > 0);

        return {
          text: combinedText,
          markdown: combinedMarkdown,
          title: article.title || document.title || '',
          excerpt: article.excerpt || combinedText.slice(0, 200) + (combinedText.length > 200 ? '...' : ''),
          metadata: {
            hostname: window.location.hostname,
            url: window.location.href,
            title: article.title || document.title || '',
            byline: article.byline || metadata.byline,
            dir: article.dir || document.documentElement.dir,
            lang: article.lang || document.documentElement.lang,
            contentLength: combinedText.length,
            wordCount: words.length,
            readingTimeMinutes: Math.max(1, Math.ceil(words.length / 200)),
            hasContent: combinedText.length > 50,
            extractionMethod: 'mozilla-readability',
            shadowDOMCount: shadowData.count,
            iframeCount: iframeData.count,
            readabilityScore: this.calculateReadabilityScore(combinedText),
            contentDensity: combinedText.length / originalLength,
            isArticle: true,
            publishedTime: metadata.publishedTime,
            siteName: metadata.siteName,
            fallbackUsed: false,
            debugInfo: {
              originalLength,
              cleanedLength: combinedText.length,
              removedElements: [],
              contentSelectors: ['mozilla-readability'],
              imageCount: doc.querySelectorAll('img').length,
              linkCount: doc.querySelectorAll('a').length,
              paragraphCount: doc.querySelectorAll('p').length,
            }
          },
          comments: [],
          transcriptCues: []
        };
      }

      // Readability failed, use fallback
      console.log('Sol: Readability extraction failed, using fallback');
      return this.createFallbackExtraction();

    } catch (error) {
      console.error('Sol: Content extraction failed:', error);
      return this.createFallbackExtraction();
    }
  }

  /**
   * Wait for YouTube page to be fully ready before scraping
   * This prevents constant re-scraping that causes visual impact
   */
  private async waitForYouTubePageReady(): Promise<void> {
    const maxWaitTime = 10000; // 10 seconds max
    const startTime = Date.now();

    // Wait for basic page readiness
    while (document.readyState !== 'complete' && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Wait for YouTube-specific elements that indicate the page is ready
    const requiredSelectors = [
      'h1.ytd-watch-metadata', // Video title
      '#top-level-buttons-computed', // More actions button area
      '.html5-video-player' // Video player
    ];

    for (const selector of requiredSelectors) {
      await this.waitForElement(selector, 3000); // 3 seconds per element
    }

    console.log('Sol ContentScraper: YouTube page ready for scraping');
  }

  /**
   * Wait for a specific element to appear in the DOM
   */
  private async waitForElement(selector: string, timeout: number = 5000): Promise<Element | null> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.warn(`Sol ContentScraper: Element ${selector} not found within ${timeout}ms`);
    return null;
  }

  public getPluginRegistry() {
    return pluginScraperRegistry;
  }

  public getDebugInfo(scrapedContent: ScrapedContent): any {
    const meta = scrapedContent.metadata;
    return {
      // Core extraction info
      hostname: meta.hostname,
      extractionMethod: meta.extractionMethod,
      fallbackUsed: meta.fallbackUsed,
      isArticle: meta.isArticle,
      
      // Content metrics
      contentLength: meta.contentLength,
      wordCount: meta.wordCount,
      readingTimeMinutes: meta.readingTimeMinutes,
      readabilityScore: Math.round(meta.readabilityScore),
      contentDensity: Math.round(meta.contentDensity * 100) + '%',
      
      // Technical details
      shadowDOMCount: meta.shadowDOMCount,
      iframeCount: meta.iframeCount,
      
      // Content analysis
      imageCount: meta.debugInfo.imageCount,
      linkCount: meta.debugInfo.linkCount,
      paragraphCount: meta.debugInfo.paragraphCount,
      
      // Metadata
      byline: meta.byline,
      publishedTime: meta.publishedTime,
      siteName: meta.siteName,
      lang: meta.lang,
      
      // Debug details
      originalLength: meta.debugInfo.originalLength,
      cleanedLength: meta.debugInfo.cleanedLength,
      compressionRatio: meta.debugInfo.originalLength > 0 ? 
        Math.round((meta.debugInfo.cleanedLength / meta.debugInfo.originalLength) * 100) + '%' : '0%',
      
      // Preview
      preview: scrapedContent.text.substring(0, 300) + (scrapedContent.text.length > 300 ? '...' : ''),
      markdownPreview: scrapedContent.markdown.substring(0, 300) + (scrapedContent.markdown.length > 300 ? '...' : '')
    };
  }
}