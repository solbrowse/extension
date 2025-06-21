import { ScraperPlugin } from '../pluginScraperRegistry';
import { ScrapedContent, TranscriptCue } from '../../contentScraper';

/**
 * Regex helpers
 */
const RE_YOUTUBE_ID = /(?:youtube\.com\/(?:[^\/]+\/.*\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/#\s]{11})/i;

/**
 * Extract the YouTube video ID from a URL.
 */
function extractVideoId(url: string): string | null {
  const match = url.match(RE_YOUTUBE_ID);
  return match?.[1] || null;
}

/**
 * Extract transcript from YouTube's rendered transcript panel.
 * This is the most reliable method since it uses YouTube's own UI.
 */
function extractTranscriptFromUI(videoId: string): TranscriptCue[] {
  console.log('Sol YouTube Scraper: Extracting transcript from UI elements');
  
  // Try to find and click the transcript button if not already open
  const transcriptButton = document.querySelector('button[aria-label*="transcript" i], button[aria-label*="Show transcript" i]');
  if (transcriptButton && !document.querySelector('ytd-transcript-segment-renderer')) {
    console.log('Sol YouTube Scraper: Found transcript button, clicking to open panel');
    (transcriptButton as HTMLElement).click();
    
    // Wait a moment for the panel to load
    setTimeout(() => {}, 500);
  }

  // Extract from rendered transcript segments
  const transcriptElements = document.querySelectorAll('ytd-transcript-segment-renderer');
  console.log(`Sol YouTube Scraper: Found ${transcriptElements.length} transcript elements`);
  
  if (transcriptElements.length === 0) {
    return [];
  }

  const cues: TranscriptCue[] = [];
  
  transcriptElements.forEach((element) => {
    try {
      const timeElement = element.querySelector('.ytd-transcript-segment-renderer[role="button"] .segment-timestamp');
      const textElement = element.querySelector('.ytd-transcript-segment-renderer[role="button"] .segment-text');
      
      if (timeElement && textElement) {
        const timeText = timeElement.textContent?.trim();
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
      console.warn('Sol YouTube Scraper: Error parsing transcript element:', error);
    }
  });
  
  console.log(`Sol YouTube Scraper: Extracted ${cues.length} transcript cues from UI`);
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

  let content = '';
  const comments: string[] = [];
  let transcriptCues: TranscriptCue[] = [];

  // Extract title
  const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string, h1.ytd-video-primary-info-renderer');
  if (titleElement) {
    const title = titleElement.textContent?.trim();
    if (title) {
      console.log(`Sol YouTube Scraper: Found title: ${title}`);
      content += `Title: ${title}\n\n`;
    }
  }

  // Extract description
  const descriptionElement = document.querySelector('ytd-expandable-video-description-body-renderer, #description-text, .ytd-video-secondary-info-renderer #description');
  if (descriptionElement) {
    const description = descriptionElement.textContent?.trim();
    if (description) {
      console.log(`Sol YouTube Scraper: Found description (${description.length} chars)`);
      content += `Description: ${description}\n\n`;
    }
  }

  // Extract comments
  const commentElements = document.querySelectorAll('ytd-comment-thread-renderer #content-text, ytd-comment-renderer #content-text');
  commentElements.forEach((el, index) => {
    if (index < 10) { // Limit to first 10 comments
      const commentText = el.textContent?.trim();
      if (commentText && commentText.length > 10) {
        comments.push(commentText);
      }
    }
  });
  
  if (comments.length > 0) {
    console.log(`Sol YouTube Scraper: Found ${comments.length} comments`);
    content += `Comments:\n${comments.map(c => `- ${c}`).join('\n')}\n\n`;
  }

  // Extract transcript
  console.log(`Sol YouTube Scraper: Attempting transcript extraction for video ID: ${videoId}`);
  transcriptCues = extractTranscriptFromUI(videoId);
  
  if (transcriptCues.length > 0) {
    const transcriptText = transcriptCues.map(cue => cue.text).join(' ');
    console.log(`Sol YouTube Scraper: Extracted ${transcriptCues.length} cues, ${transcriptText.length} chars`);
    content += `Transcript:\n${transcriptText}\n\n`;
  } else {
    console.log('Sol YouTube Scraper: No transcript found');
  }

  console.log(`Sol YouTube Scraper: Final extraction - text: ${content.length} chars, comments: ${comments.length}, transcript cues: ${transcriptCues.length}`);
  
  // Extract title for metadata
  const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string, h1.ytd-video-primary-info-renderer');
  const title = titleEl?.textContent?.trim() || document.title || '';
  
  return {
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
        contentSelectors: ['h1.ytd-video-primary-info-renderer', 'ytd-expandable-video-description-body-renderer', 'ytd-comment-thread-renderer'],
        imageCount: 0,
        linkCount: 0,
        paragraphCount: content.split('\n\n').length
      }
    },
    comments,
    transcriptCues
  };
}

const youtubePlugin: ScraperPlugin = {
  name: 'YouTube',
  version: '4.0.0',
  description: 'Extracts YouTube video title, description, comments, and transcript using UI-based extraction',
  hostPatterns: [/youtube\.com\//, /youtu\.be\//],
  priority: 75,
  scraper: youtubeScraper
};

export default youtubePlugin; 