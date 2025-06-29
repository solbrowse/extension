import { ScraperPlugin } from '../pluginRegistry';
import { ScrapedContent, TranscriptCue } from '../scape';

/**
 * Regex helpers
 */
const RE_YOUTUBE_ID = /(?:youtube\.com\/(?:[^\/]+\/.*\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/#\s]{11})/i;

// Cache to prevent re-scraping the same content
const contentCache = new Map<string, { content: ScrapedContent; timestamp: number }>();
const CACHE_DURATION = 30000; // 30 seconds

/**
 * Extract the YouTube video ID from a URL.
 */
function extractVideoId(url: string): string | null {
  const match = url.match(RE_YOUTUBE_ID);
  return match?.[1] || null;
}

/**
 * Utility to wait for elements to appear in the DOM
 */
function waitForElement(selector: string, timeout = 5000): Promise<Element | null> {
  return new Promise((resolve) => {
    const element = document.querySelector(selector);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Extract transcript using YouTube's UI - but only if not already extracted recently
 */
async function extractTranscriptFromUI(videoId: string): Promise<TranscriptCue[]> {
  console.log('Sol YouTube: Attempting transcript extraction via UI');

  try {
    // Check if transcript panel is already open
    const existingPanel = document.querySelector('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #content');
    if (existingPanel) {
      console.log('Sol YouTube: Transcript panel already open, extracting segments');
      return extractSegmentsFromPanel(existingPanel);
    }

    // Step 1: Click "More actions" button (three dots) - only if not already clicked
    const moreActionsButton = document.querySelector('button[aria-label="More actions"]') as HTMLElement;
    if (!moreActionsButton) {
      console.log('Sol YouTube: More actions button not found');
      return [];
    }

    // Check if menu is already open
    const existingMenu = document.querySelector('ytd-menu-popup-renderer[role="menu"]');
    if (!existingMenu) {
      moreActionsButton.click();
      console.log('Sol YouTube: Clicked more actions button');
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    // Step 2: Wait for and click "Show transcript" button
    const transcriptButton = await waitForElement('[aria-label="Show transcript"]', 3000) as HTMLElement;
    if (!transcriptButton) {
      console.log('Sol YouTube: Show transcript button not found');
      return [];
    }

    transcriptButton.click();
    console.log('Sol YouTube: Clicked show transcript button');

    // Step 3: Wait for transcript panel to load with segments
    const transcriptPanel = await waitForElement('ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"] #content', 5000);
    if (!transcriptPanel) {
      console.log('Sol YouTube: Transcript panel not found');
      return [];
    }

    // Wait a bit for segments to load
    await new Promise(resolve => setTimeout(resolve, 1000));

    return extractSegmentsFromPanel(transcriptPanel);

  } catch (error) {
    console.error('Sol YouTube: Error in UI transcript extraction:', error);
    return [];
  }
}

/**
 * Extract segments from an already loaded transcript panel
 */
function extractSegmentsFromPanel(transcriptPanel: Element): TranscriptCue[] {
  const segmentElements = transcriptPanel.querySelectorAll('ytd-transcript-segment-renderer');
  console.log(`Sol YouTube: Found ${segmentElements.length} transcript segments`);

  if (segmentElements.length === 0) {
    return [];
  }

  const cues: TranscriptCue[] = [];
  
  segmentElements.forEach((segment) => {
    try {
      const timestampElement = segment.querySelector('.segment-timestamp');
      const textElement = segment.querySelector('.segment-text');
      
      if (timestampElement && textElement) {
        const timeText = timestampElement.textContent?.trim();
        const text = textElement.textContent?.trim();
        
        if (timeText && text) {
          // Parse time format (e.g., "1:23" or "12:34")
          const timeParts = timeText.split(':').map(p => parseInt(p, 10));
          let startTime = 0;
          
          if (timeParts.length === 2) {
            startTime = timeParts[0] * 60 + timeParts[1];
          } else if (timeParts.length === 3) {
            startTime = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
          }
          
          cues.push({
            offset: startTime,
            duration: 5, // Default duration since YouTube doesn't provide end times
            text: text
          });
        }
      }
    } catch (error) {
      console.warn('Sol YouTube: Error parsing transcript segment:', error);
    }
  });

  console.log(`Sol YouTube: Successfully extracted ${cues.length} transcript cues`);
  return cues;
}

/**
 * Main YouTube scraper function.
 */
async function youtubeScraper(document: Document): Promise<ScrapedContent> {
  console.log('Sol YouTube Scraper: Starting extraction for', window.location.href);
  
  const videoId = extractVideoId(window.location.href);
  if (!videoId) {
    console.warn('Sol YouTube Scraper: Could not extract video ID');
    return createEmptyResult();
  }

  // Check cache first to prevent unnecessary re-scraping
  const cacheKey = `${videoId}-${window.location.href}`;
  const cached = contentCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
    console.log('Sol YouTube Scraper: Using cached content');
    return cached.content;
  }

  let content = '';
  let transcriptCues: TranscriptCue[] = [];

  // Extract title - always available
  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string, h1.ytd-video-primary-info-renderer');
  if (titleElement) {
    const title = titleElement.textContent?.trim();
    if (title) {
      console.log(`Sol YouTube Scraper: Found title: ${title}`);
      content += `Title: ${title}\n\n`;
    }
  }

  // Extract description - always available
  const descriptionElement = document.querySelector('ytd-expandable-video-description-body-renderer, #description-text, .ytd-video-secondary-info-renderer #description');
  if (descriptionElement) {
    const description = descriptionElement.textContent?.trim();
    if (description) {
      console.log(`Sol YouTube Scraper: Found description (${description.length} chars)`);
      content += `Description: ${description}\n\n`;
    }
  }

  // Extract transcript - but only if transcript panel is already open or can be opened quietly
  console.log(`Sol YouTube Scraper: Checking for transcript for video ID: ${videoId}`);
  
  // Only attempt transcript extraction if we haven't tried recently for this video
  const transcriptCacheKey = `transcript-${videoId}`;
  const transcriptCached = contentCache.get(transcriptCacheKey);
  if (!transcriptCached || (Date.now() - transcriptCached.timestamp) > CACHE_DURATION * 2) {
    transcriptCues = await extractTranscriptFromUI(videoId);
    
    // Cache transcript result
    contentCache.set(transcriptCacheKey, {
      content: { transcriptCues } as any,
      timestamp: Date.now()
    });
  } else {
    transcriptCues = (transcriptCached.content as any).transcriptCues || [];
    console.log('Sol YouTube Scraper: Using cached transcript');
  }
  
  if (transcriptCues.length > 0) {
    const transcriptText = transcriptCues.map(cue => cue.text).join(' ');
    console.log(`Sol YouTube Scraper: Using ${transcriptCues.length} transcript cues, ${transcriptText.length} chars`);
    content += `Transcript:\n${transcriptText}\n\n`;
  } else {
    console.log('Sol YouTube Scraper: No transcript available');
  }

  console.log(`Sol YouTube Scraper: Final extraction - text: ${content.length} chars, transcript cues: ${transcriptCues.length}`);
  
  // Extract title for metadata
  const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string, h1.ytd-video-primary-info-renderer');
  const title = titleEl?.textContent?.trim() || document.title || '';
  
  const result: ScrapedContent = {
    text: content,
    markdown: content, // Use same content as markdown since it's already formatted
    title: title,
    excerpt: content.length > 200 ? content.substring(0, 200) + '...' : content,
    metadata: {
      hostname: window.location.hostname,
      url: window.location.href,
      title: title,
      byline: null,
      dir: null,
      lang: document.documentElement.lang || null,
      contentLength: content.length,
      wordCount: content.split(/\s+/).length,
      readingTimeMinutes: Math.ceil(content.split(/\s+/).length / 200),
      hasContent: content.length > 0,
      extractionMethod: 'youtube-plugin',
      shadowDOMCount: 0,
      iframeCount: 0,
      readabilityScore: 85, // YouTube content is generally easy to read
      contentDensity: content.length / Math.max(1, document.body.textContent?.length || 1),
      isArticle: false,
      publishedTime: null,
      siteName: 'YouTube',
      fallbackUsed: false,
      debugInfo: {
        originalLength: document.body.textContent?.length || 0,
        cleanedLength: content.length,
        removedElements: [],
        contentSelectors: ['h1.ytd-video-primary-info-renderer', 'ytd-expandable-video-description-body-renderer'],
        imageCount: 0,
        linkCount: 0,
        paragraphCount: content.split('\n\n').length
      }
    },
    transcriptCues
  };

  // Cache the result
  contentCache.set(cacheKey, {
    content: result,
    timestamp: Date.now()
  });

  return result;
}

function createEmptyResult(): ScrapedContent {
  return {
    text: '',
    markdown: '',
    title: document.title || '',
    excerpt: '',
    metadata: {
      hostname: window.location.hostname,
      url: window.location.href,
      title: document.title || '',
      byline: null,
      dir: null,
      lang: null,
      contentLength: 0,
      wordCount: 0,
      readingTimeMinutes: 0,
      hasContent: false,
      extractionMethod: 'youtube-plugin',
      shadowDOMCount: 0,
      iframeCount: 0,
      readabilityScore: 0,
      contentDensity: 0,
      isArticle: false,
      publishedTime: null,
      siteName: 'YouTube',
      fallbackUsed: false,
      debugInfo: {
        originalLength: 0,
        cleanedLength: 0,
        removedElements: [],
        contentSelectors: [],
        imageCount: 0,
        linkCount: 0,
        paragraphCount: 0
      }
    },
    comments: [],
    transcriptCues: []
  };
}

const youtubePlugin: ScraperPlugin = {
  name: 'YouTube',
  version: '8.0.0',
  description: 'Extracts YouTube video title, description, and transcript without scrolling. Includes caching to prevent constant re-scraping.',
  hostPatterns: [/youtube\.com\//, /youtu\.be\//],
  priority: 85, // Higher priority due to reliability
  scraper: youtubeScraper
};

export default youtubePlugin; 