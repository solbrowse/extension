import '@src/utils/logger';
import { ContentScraperService } from '@src/services/scraping/scrape';
import { portManager } from './PortManager';
import { ContentInitMsg, ContentDeltaMsg } from '@src/types/messaging';

function isSignificant(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') {
    const attrName = mutation.attributeName;
    return attrName !== 'style' && attrName !== 'class';
  }

  if (mutation.type === 'characterData') {
    const parent = mutation.target.parentElement;
    return !!parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName);
  }

  if (mutation.type === 'childList') {
    const nodes = Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes));
    return nodes.some((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent?.trim().length || 0) > 0;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        return !['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(el.tagName);
      }
      return false;
    });
  }

  return true; // default to true for any other mutation types
}

function debounce<T extends any[]>(fn: (...args: T) => void, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T): void => {
    if (timer) {
      clearTimeout(timer);
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- Node vs browser typings
    timer = setTimeout(() => fn(...args), wait);
  };
} 

export class ScraperController {
  private currentUrl: string;
  private lastScrapeContent = '';
  private lastScrapeUrl = ''; // Track URL of last scrape
  private lastScrapeTime = 0; // Track time of last scrape
  private scrapeHistory: number[] = []; // Track scrape timestamps for rate limiting
  private mutationObserver: MutationObserver | null = null;
  private readonly tabId: number;
  private askBarOpenCallback: (() => boolean) | null = null;

  constructor(tabId: number) {
    this.tabId = tabId;
    this.currentUrl = window.location.href;
  }

  /** Set callback to check if Ask Bar is open */
  setAskBarOpenCallback(callback: () => boolean): void {
    this.askBarOpenCallback = callback;
  }

  /** Trigger a manual scrape (e.g., when Ask Bar opens) */
  triggerManualScrape(): void {
    this.performDeltaScrape('manual');
  }

  /** Initialise scraping infrastructure but do NOT start observers yet. */
  async init(): Promise<void> {
    this.prepareMutationObserver();
    this.prepareNavigationHooks();
  }

  /** Perform initial scrape and start observing */
  start(): void {
    this.performInitialScrape();
    this.mutationObserver?.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    this.activateNavigationHooks();
  }

  stop(): void {
    this.mutationObserver?.disconnect();
    this.mutationObserver = null;
    this.deactivateNavigationHooks();
  }

  cleanup(): void {
    this.stop();
  }

  /** Public accessor for the latest scraped raw text (for debugging). */
  getLastScrapeContent(): string {
    return this.lastScrapeContent;
  }

  /** Check if we can scrape based on rate limiting */
  private canScrape(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old entries
    this.scrapeHistory = this.scrapeHistory.filter(time => time > oneMinuteAgo);
    
    // Rate limits
    const maxScrapesPerMinute = 3;
    
    if (this.scrapeHistory.length >= maxScrapesPerMinute) {
      return false;
    }
    
    return true;
  }

  /** Record a scrape timestamp */
  private recordScrape(): void {
    this.scrapeHistory.push(Date.now());
  }

  // -------------------------------------------
  // Scraping helpers
  // -------------------------------------------

  private async performInitialScrape(): Promise<void> {

    if (!this.canScrape()) {
      console.log('Sol ScraperController: Skipping initial scrape - rate limited');
      return;
    }

    const scrapedContent = await ContentScraperService.getInstance().scrapePageContent();
    this.lastScrapeContent = scrapedContent.text;
    this.recordScrape();

    const msg: ContentInitMsg = {
      type: 'INIT_SCRAPE',
      tabId: this.tabId,
      url: window.location.href,
      title: document.title,
      html: scrapedContent.text,
      timestamp: Date.now(),
    };
    portManager.post(msg);
  }

  private performDeltaScrape = debounce(async (changeType: 'mutation' | 'navigation' | 'manual') => {
    // Removed Ask Bar visibility check for delta scrapes as well

    if (!this.canScrape()) {
      console.log('Sol ScraperController: Skipping delta scrape - rate limited');
      return;
    }

    const currentUrl = window.location.href;
    const now = Date.now();
    
    // Skip if same URL scraped recently (within 2 seconds)
    if (this.lastScrapeUrl === currentUrl && (now - this.lastScrapeTime) < 2000) {
      console.log('Sol ScraperController: Skipping scrape - same URL scraped recently');
      return;
    }
    
    const scrapedContent = await ContentScraperService.getInstance().scrapePageContent();
    // Only send if changed significantly
    if (!this.hasSignificantContentChange(scrapedContent.text, changeType)) {
      return;
    }
    this.lastScrapeContent = scrapedContent.text;
    this.lastScrapeUrl = currentUrl;
    this.lastScrapeTime = now;
    this.recordScrape();

    const msg: ContentDeltaMsg = {
      type: 'DELTA_SCRAPE',
      tabId: this.tabId,
      url: window.location.href,
      html: scrapedContent.text,
      changeType,
      timestamp: Date.now(),
    };
    portManager.post(msg);
  }, 800);

  private hasSignificantContentChange(newContent: string, changeType: 'mutation' | 'navigation' | 'manual'): boolean {
    if (!this.lastScrapeContent) return true;
    if (changeType === 'manual' || changeType === 'navigation') return true;

    const lengthDiff = Math.abs(newContent.length - this.lastScrapeContent.length);
    const lengthChangePercent = lengthDiff / this.lastScrapeContent.length;
    return lengthChangePercent > 0.1;
  }

  // -------------------------------------------
  // Mutation observer / navigation hooks
  // -------------------------------------------

  private prepareMutationObserver(): void {
    if (this.mutationObserver) return;
    this.mutationObserver = new MutationObserver((muts) => {
      if (muts.some(isSignificant)) {
        this.performDeltaScrape('mutation');
      }
    });
  }

  private originalPush!: typeof history.pushState;
  private originalReplace!: typeof history.replaceState;
  private popListener = () => this.handleNavigation();

  private prepareNavigationHooks(): void {
    this.originalPush = history.pushState;
    this.originalReplace = history.replaceState;
  }

  private activateNavigationHooks(): void {
    history.pushState = (...args: Parameters<typeof history.pushState>) => {
      this.originalPush.apply(history, args);
      this.handleNavigation();
    };
    history.replaceState = (...args: Parameters<typeof history.replaceState>) => {
      this.originalReplace.apply(history, args);
      this.handleNavigation();
    };
    window.addEventListener('popstate', this.popListener);
  }

  private deactivateNavigationHooks(): void {
    if (this.originalPush) history.pushState = this.originalPush;
    if (this.originalReplace) history.replaceState = this.originalReplace;
    window.removeEventListener('popstate', this.popListener);
  }

  private handleNavigation(): void {
    const newUrl = window.location.href;
    if (newUrl !== this.currentUrl) {
      this.currentUrl = newUrl;
      setTimeout(() => this.performDeltaScrape('navigation'), 500);
    }
  }
} 