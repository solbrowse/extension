export interface ScrapedContent {
  text: string;
  metadata: {
    hostname: string;
    contentLength: number;
    wordCount: number;
    hasContent: boolean;
    hasSiteSpecificSelectors: boolean;
    siteSpecificSelectors: string[];
    extractionMethod: string;
  };
}

export class ContentScraperService {
  private static instance: ContentScraperService;

  public static getInstance(): ContentScraperService {
    if (!ContentScraperService.instance) {
      ContentScraperService.instance = new ContentScraperService();
    }
    return ContentScraperService.instance;
  }

  private getSiteSpecificSelectors(hostname: string): string[] {
    const sitePatterns: Record<string, string[]> = {
      'npr.org': [
        '.storytext', '.story-text', '#storytext', '.story-body-text', 
        '.story .text', '.article-body', '.transcript'
      ],
      'cnn.com': [
        '.article__content', '.zn-body__paragraph', '.article-body', 
        '.pg-rail-tall__body'
      ],
      'nytimes.com': [
        '.story-body', '.story-content', 'section[name="articleBody"]',
        '.ArticleBody-articleBody'
      ],
      'washingtonpost.com': [
        '.article-body', '.story-body', '.wpds-c-cjemOr'
      ],
      'bbc.com': [
        '.story-body', '[data-component="text-block"]', '.rich-text'
      ],
      'medium.com': [
        '.postArticle-content', 'article', '.story-content'
      ],
      'substack.com': [
        '.markup', '.post-content', '.body'
      ],
      'wikipedia.org': [
        '#mw-content-text', '.mw-parser-output'
      ],
      'github.com': [
        '.markdown-body', 'readme-toc', '.Box-body'
      ],
      'stackoverflow.com': [
        '.question-body', '.answer-body', '.post-text'
      ],
      'reddit.com': [
        '[data-testid="post-content"]', '.usertext-body', '.md'
      ]
    };

    // Try exact match first
    if (sitePatterns[hostname]) {
      return sitePatterns[hostname];
    }

    // Check for partial hostname matches
    for (const [pattern, selectors] of Object.entries(sitePatterns)) {
      if (hostname.includes(pattern) || pattern.includes(hostname.split('.').slice(-2).join('.'))) {
        return selectors;
      }
    }

    return [];
  }

  private getSelectorsToRemove(): string[] {
    return [
      // Scripts and styles
      'script', 'style', 'noscript', 'link[rel="stylesheet"]',
      // Navigation and UI elements
      'nav', 'footer', 'aside', 'header', 'menu', 
      '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]', '[role="complementary"]',
      '[role="menu"]', '[role="menubar"]', '[role="dialog"]', '[role="tooltip"]',
      // Interactive elements
      'button', 'form', 'input', 'textarea', 'select', 'label',
      // Ads and tracking
      '[class*="ad"]', '[id*="ad"]', '[class*="advertisement"]', '[id*="advertisement"]',
      '[class*="tracking"]', '[id*="tracking"]', '[class*="analytics"]', '[id*="analytics"]',
      // Social media widgets
      '[class*="social"]', '[id*="social"]', '[class*="share"]', '[id*="share"]',
      '[class*="facebook"]', '[class*="twitter"]', '[class*="instagram"]',
      // Comments and user generated content
      '#comments', '.comments', '[class*="comment"]', '[id*="comment"]',
      // Sidebars and secondary content
      '#sidebar', '.sidebar', '[class*="sidebar"]', '[id*="sidebar"]',
      '[class*="widget"]', '[id*="widget"]', '[class*="related"]', '[id*="related"]',
      // Popups and overlays
      '[class*="popup"]', '[id*="popup"]', '[class*="modal"]', '[id*="modal"]',
      '[class*="overlay"]', '[id*="overlay"]', '[class*="toast"]', '[id*="toast"]',
      // Newsletter and subscription forms
      '[class*="newsletter"]', '[id*="newsletter"]', '[class*="subscribe"]', '[id*="subscribe"]',
      // Cookie notices and legal
      '[class*="cookie"]', '[id*="cookie"]', '[class*="gdpr"]', '[id*="gdpr"]',
      // Skip links and accessibility helpers
      '[class*="skip"]', '[id*="skip"]', '[class*="sr-only"]', '[class*="screen-reader"]'
    ];
  }

  private getContentSelectors(siteSpecificSelectors: string[]): string[] {
    return [
      // Site-specific selectors have highest priority
      ...siteSpecificSelectors,
      // High priority content containers
      'main[role="main"]', 'div[role="main"]', 'section[role="main"]',
      'main', 'article', '[role="article"]',
      // News-specific selectors
      '.story-text', '.story-body', '.article-body', '.post-content', '.content-body',
      '.entry-content', '.article-content', '.story-content', '.text-content',
      // Common content class patterns
      '[class*="content"]', '[class*="article"]', '[class*="story"]', '[class*="post"]',
      '[class*="text"]', '[class*="body"]', '[class*="main"]',
      // Semantic HTML5 elements
      'section', 'div[itemtype*="Article"]', '[itemtype*="NewsArticle"]',
      // Fallback to largest text container
      'div', 'section'
    ];
  }

  private cleanText(text: string): string {
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove common non-content patterns
      .replace(/\b(click here|read more|continue reading|share this|tweet this|like this)\b/gi, '')
      // Remove email patterns
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '')
      // Remove URL patterns
      .replace(/https?:\/\/[^\s]+/g, '')
      // Remove phone number patterns
      .replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '')
      // Clean up line breaks and spacing
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .replace(/\t+/g, ' ')
      .trim();
  }

  private filterContentLines(text: string): string {
    const lines = text.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 10 && 
             !trimmed.match(/^[\d\s\-\.\,\(\)]+$/) && // Not just numbers and punctuation
             !trimmed.match(/^(menu|navigation|search|login|logout|sign up|subscribe)$/i); // Not UI labels
    });

    return lines.join('\n').trim();
  }

  private extractTextFromElement(element: HTMLElement): string {
    let text = '';
    
    // Try to get text content while preserving structure
    if (element.innerText) {
      text = element.innerText;
    } else if (element.textContent) {
      text = element.textContent;
    } else {
      // Fallback: manually extract text from text nodes
      const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null
      );
      const textNodes: string[] = [];
      let node;
      while (node = walker.nextNode()) {
        const nodeText = node.textContent?.trim();
        if (nodeText && nodeText.length > 3) {
          textNodes.push(nodeText);
        }
      }
      text = textNodes.join(' ');
    }

    return text;
  }

  public async scrapePageContent(): Promise<ScrapedContent> {
    // Wait for dynamic content to load
    await this.waitForContent();

    const hostname = window.location.hostname;
    
    // Create a deep clone of the body to work with, preserving the original page
    const content = document.body.cloneNode(true) as HTMLElement;

    // Remove unwanted elements
    const selectorsToRemove = this.getSelectorsToRemove();
    content.querySelectorAll(selectorsToRemove.join(', ')).forEach(el => el.remove());
    
    // Get site-specific selectors
    const siteSpecificSelectors = this.getSiteSpecificSelectors(hostname);
    
    // Get all content selectors in priority order
    const contentSelectors = this.getContentSelectors(siteSpecificSelectors);

    let mainContent: HTMLElement | null = null;
    let maxTextLength = 0;
    let extractionMethod = 'fallback';

    // Try each selector and pick the one with most text content
    for (const selector of contentSelectors) {
      const elements = content.querySelectorAll(selector);
      for (const element of elements) {
        const textLength = (element as HTMLElement).innerText?.length || 0;
        if (textLength > maxTextLength) {
          maxTextLength = textLength;
          mainContent = element as HTMLElement;
          
          // Determine extraction method
          if (siteSpecificSelectors.includes(selector)) {
            extractionMethod = 'site-specific';
          } else if (selector.includes('main') || selector.includes('article')) {
            extractionMethod = 'semantic';
          } else {
            extractionMethod = 'heuristic';
          }
        }
      }
      // If we found substantial content, use it
      if (maxTextLength > 500) break;
    }

    // Fallback to body if no good content container found
    const textSource = mainContent || content;
    
    // Extract and clean text
    let rawText = this.extractTextFromElement(textSource);
    let cleanedText = this.cleanText(rawText);
    let finalText = this.filterContentLines(cleanedText);

    // Create metadata
    const metadata = {
      hostname,
      contentLength: finalText.length,
      wordCount: finalText.split(/\s+/).length,
      hasContent: finalText.length > 100,
      hasSiteSpecificSelectors: siteSpecificSelectors.length > 0,
      siteSpecificSelectors: siteSpecificSelectors.slice(0, 3), // First 3 for display
      extractionMethod
    };

    // Log extracted content length for debugging
    console.log(`Sol ContentScraper: Extracted ${finalText.length} characters from ${hostname} using ${extractionMethod} method`);
    
    return {
      text: finalText,
      metadata
    };
  }

  private waitForContent(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (document.readyState === 'complete') {
        // Additional wait for dynamic content
        setTimeout(resolve, 1000);
      } else {
        window.addEventListener('load', () => {
          setTimeout(resolve, 1000);
        });
      }
    });
  }

  public getDebugInfo(scrapedContent: ScrapedContent): any {
    return {
      ...scrapedContent.metadata,
      preview: scrapedContent.text.substring(0, 500) + (scrapedContent.text.length > 500 ? '...' : '')
    };
  }
} 