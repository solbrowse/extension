import { ScraperPlugin } from '../pluginRegistry';
import { ScrapedContent, TranscriptCue } from '../scrape';

/**
 * Utilities ────────────────────────────────────────────────────────────────
 */

/** Extract the ytInitialPlayerResponse JSON from the page <script> tags */
function extractPlayerResponse(doc: Document): any | null {
  console.log('Sol:[YouTube Scraper] Looking for ytInitialPlayerResponse in scripts...');
  const scripts = Array.from(doc.querySelectorAll('script'));
  console.log('Sol:[YouTube Scraper] Found', scripts.length, 'script tags');
  
  for (let i = 0; i < scripts.length; i++) {
    const script = scripts[i];
    const content = script.textContent || '';
    const marker = 'ytInitialPlayerResponse';
    const idx = content.indexOf(marker);
    if (idx === -1) continue;

    console.log('Sol:[YouTube Scraper] Found ytInitialPlayerResponse in script', i);
    console.log('Sol:[YouTube Scraper] Script content preview around marker:', content.substring(Math.max(0, idx - 50), idx + 100));

    // Find the first "{" after the marker and parse until matching "}" balance.
    const braceStart = content.indexOf('{', idx);
    if (braceStart === -1) {
      console.log('Sol:[YouTube Scraper] No opening brace found after marker');
      continue;
    }

    console.log('Sol:[YouTube Scraper] Found opening brace at position', braceStart);

    let braceDepth = 0;
    let endIdx = -1;
    for (let i = braceStart; i < content.length; i++) {
      const ch = content[i];
      if (ch === '{') braceDepth++;
      else if (ch === '}') {
        braceDepth--;
        if (braceDepth === 0) {
          endIdx = i + 1; // include closing brace
          break;
        }
      }
    }

    if (endIdx !== -1) {
      const jsonText = content.slice(braceStart, endIdx);
      console.log('Sol:[YouTube Scraper] Extracted JSON length:', jsonText.length);
      console.log('Sol:[YouTube Scraper] JSON preview:', jsonText.substring(0, 200));
      try {
        const parsed = JSON.parse(jsonText);
        console.log('Sol:[YouTube Scraper] Successfully parsed ytInitialPlayerResponse');
        return parsed;
      } catch (err) {
        console.warn('Sol:[YouTube Scraper] Failed to parse playerResponse JSON', err);
        console.log('Sol:[YouTube Scraper] JSON text that failed to parse:', jsonText.substring(0, 500));
      }
    } else {
      console.log('Sol:[YouTube Scraper] No matching closing brace found');
    }
  }
  
  console.log('Sol:[YouTube Scraper] ytInitialPlayerResponse not found in any script');
  return null;
}

/** Pick the best caption track according to preference rules */
function pickBestCaptionTrack(tracks: any[] | undefined): any | null {
  if (!tracks || !Array.isArray(tracks)) return null;
  // Helper predicates
  const isEnglish = (t: any) => t.languageCode?.startsWith('en');
  const isManual = (t: any) => !t.kind || t.kind !== 'asr';
  // Preference order
  const candidates = [
    tracks.find(t => isEnglish(t) && isManual(t)), // English manual
    tracks.find(t => isEnglish(t) && !isManual(t)), // English ASR
    tracks[0] // Anything
  ];
  return candidates.find(Boolean) || null;
}

/** Append / replace a query param */
function withQueryParam(url: string, key: string, value: string): string {
  const u = new URL(url);
  u.searchParams.set(key, value);
  return u.toString();
}

/** Parse caption JSON3 response into TranscriptCue[] */
function parseJson3Captions(json: any, lang?: string): TranscriptCue[] {
  if (!json?.events) return [];
  const cues: TranscriptCue[] = [];
  for (const ev of json.events) {
    if (!ev?.segs?.length) continue;
    const text = ev.segs.map((s: any) => s.utf8).join('').trim();
    if (!text) continue;
    const offset = (ev.tStartMs ?? 0) / 1000;
    const duration = (ev.dDurationMs ?? ev.dDuration ?? 0) / 1000;
    cues.push({ text, offset, duration, lang });
  }
  return cues;
}

/** Parse XML captions <text start dur> */
function parseXmlCaptions(xmlStr: string, lang?: string): TranscriptCue[] {
  try {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
    const texts = Array.from(xmlDoc.getElementsByTagName('text'));
    const decode = (s: string) => {
      const div = document.createElement('div');
      div.innerHTML = s.replace(/\n/g, ' ');
      return div.textContent || div.innerText || '';
    };
    return texts.map(t => {
      const offset = parseFloat(t.getAttribute('start') || '0');
      const duration = parseFloat(t.getAttribute('dur') || '0');
      const text = decode(t.textContent || '');
      return { text, offset, duration, lang } as TranscriptCue;
    }).filter(c => c.text.trim().length > 0);
  } catch (err) {
    console.warn('Sol:[YouTube Scraper] Failed to parse XML captions', err);
    return [];
  }
}

/** Convert cues to plain text (joined by newline) */
function cuesToText(cues: TranscriptCue[]): string {
  return cues.map(c => c.text).join('\n').trim();
}

/**
 * Alternative approach: Try to get captions from YouTube's internal state
 */
function extractCaptionsFromYouTubeInternals(doc: Document): TranscriptCue[] {
  console.log('Sol:[YouTube Scraper] Attempting to extract captions from YouTube internals');
  
  // Try to access YouTube's internal player state
  try {
    // @ts-ignore - accessing YouTube's global objects
    const ytd = (window as any).ytd;
    const ytplayer = (window as any).ytplayer;
    
    if (ytd?.app?.data) {
      console.log('Sol:[YouTube Scraper] Found ytd.app.data');
      // Try to find caption data in the app state
      const appData = ytd.app.data;
      console.log('Sol:[YouTube Scraper] App data keys:', Object.keys(appData));
    }
    
    if (ytplayer) {
      console.log('Sol:[YouTube Scraper] Found ytplayer object');
      // Try to get captions from the player
      console.log('Sol:[YouTube Scraper] ytplayer keys:', Object.keys(ytplayer));
    }
    
    // Look for any caption-related objects in the global scope
    const globalKeys = Object.keys(window).filter(key => 
      key.toLowerCase().includes('caption') || 
      key.toLowerCase().includes('subtitle') ||
      key.toLowerCase().includes('transcript')
    );
    
    if (globalKeys.length > 0) {
      console.log('Sol:[YouTube Scraper] Found caption-related globals:', globalKeys);
    }
    
  } catch (err) {
    console.log('Sol:[YouTube Scraper] Could not access YouTube internals:', err);
  }
  
  return [];
}

/**
 * Scraper implementation ───────────────────────────────────────────────────
 */
async function scrapeYouTube(doc: Document, pageUrl: string): Promise<ScrapedContent> {
  console.log('Sol:[YouTube Scraper] Starting for', pageUrl);

  const playerResponse = extractPlayerResponse(doc);
  console.log('Sol:[YouTube Scraper] Player response:', playerResponse ? 'Found' : 'Not found');

  const videoDetails = playerResponse?.videoDetails || {};
  console.log('Sol:[YouTube Scraper] Video details keys:', videoDetails ? Object.keys(videoDetails) : 'none');

  const captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  console.log('Sol:[YouTube Scraper] Caption tracks found:', captionTracks?.length || 0);

  let transcriptCues: TranscriptCue[] = [];
  let extractionMethod = 'youtube-plugin';
  let fallbackUsed = false;

  // First try: Extract from YouTube's internal state
  transcriptCues = extractCaptionsFromYouTubeInternals(doc);
  if (transcriptCues.length > 0) {
    console.log('Sol:[YouTube Scraper] Extracted', transcriptCues.length, 'cues from internals');
    extractionMethod = 'youtube-internals';
  }

  // Second try: Fetch captions via API (likely to fail in extension context)
  if (captionTracks?.length && transcriptCues.length === 0) {
    console.log('Sol:[YouTube Scraper] Attempting API-based caption extraction');
    const track = pickBestCaptionTrack(captionTracks);
    if (track) {
      console.log('Sol:[YouTube Scraper] Selected track', track.languageCode, track.kind || 'manual');
      
      // Note: This approach likely won't work in browser extensions due to CORS/auth restrictions
      // but we'll try it once with same-origin credentials as a fallback
      try {
        const xmlUrl = track.baseUrl as string;
        console.log('Sol:[YouTube Scraper] Attempting single XML fetch (likely to fail)');
        const resp = await fetch(xmlUrl, { credentials: 'same-origin' });
        
        if (resp.ok) {
          const xmlText = await resp.text();
          if (xmlText.trim().length > 0) {
            transcriptCues = parseXmlCaptions(xmlText, track.languageCode);
            if (transcriptCues.length > 0) {
              console.log('Sol:[YouTube Scraper] Successfully extracted', transcriptCues.length, 'cues from API');
              extractionMethod = 'youtube-caption-api-xml';
            }
          }
        }
      } catch (err) {
        console.log('Sol:[YouTube Scraper] API extraction failed as expected:', err);
      }
    }
  }

  // Third try: Extract from DOM transcript panel (most reliable method)
  if (!transcriptCues.length) {
    console.log('Sol:[YouTube Scraper] Attempting DOM transcript extraction');
    
    // Try multiple selectors for transcript segments
    const transcriptSelectors = [
      'ytd-transcript-segment-renderer',
      '.ytd-transcript-segment-renderer',
      '[class*="transcript-segment"]',
      '.segment-text',
      '.cue-group'
    ];
    
    let segs: Element[] = [];
    for (const selector of transcriptSelectors) {
      segs = Array.from(doc.querySelectorAll(selector));
      if (segs.length > 0) {
        console.log(`Sol:[YouTube Scraper] Found ${segs.length} segments with selector: ${selector}`);
        break;
      }
    }
    
    if (segs.length) {
      console.log('Sol:[YouTube Scraper] Extracting from transcript panel with', segs.length, 'segments');
      extractionMethod = 'youtube-transcript-panel';
      transcriptCues = segs.map((seg, idx) => {
        // Try multiple text selectors
        const textSelectors = ['#segment-text', 'yt-formatted-string', '.segment-text', '.cue-text'];
        const timeSelectors = ['#segment-timestamp', '.segment-timestamp', '.cue-time'];
        
        let textEl: Element | null = null;
        let timeEl: Element | null = null;
        
        for (const selector of textSelectors) {
          textEl = seg.querySelector(selector);
          if (textEl) break;
        }
        
        for (const selector of timeSelectors) {
          timeEl = seg.querySelector(selector);
          if (timeEl) break;
        }
        
        const text = textEl?.textContent?.trim() || '';
        const ts = timeEl?.textContent?.trim() || '';
        const offset = parseTimestampToSeconds(ts);
        
        if (idx < 5) { // Log first 5 segments for debugging
          console.log(`Sol:[YouTube Scraper] Segment ${idx}: "${text}" at ${ts} (${offset}s)`);
        }
        
        return {
          text,
          offset,
          duration: 0,
        } as TranscriptCue;
      }).filter(c => c.text.length > 0);
      
      console.log('Sol:[YouTube Scraper] Successfully extracted', transcriptCues.length, 'transcript cues from DOM');
    } else {
      console.log('Sol:[YouTube Scraper] No transcript segments found in DOM');
      console.log('Sol:[YouTube Scraper] To get transcripts, open the video transcript panel before scraping');
      
      // Try to find the transcript button to give user guidance
      const transcriptButton = doc.querySelector('[aria-label*="transcript" i], [aria-label*="Show transcript" i], .ytd-transcript-search-panel-renderer');
      if (transcriptButton) {
        console.log('Sol:[YouTube Scraper] Found transcript button - user should click it to enable transcript extraction');
      } else {
        console.log('Sol:[YouTube Scraper] No transcript button found - video may not have captions available');
      }
    }
  }

  if (!transcriptCues.length) {
    console.log('Sol:[YouTube Scraper] No transcript available');
    fallbackUsed = true;
  }

  // Build content strings
  const transcriptText = transcriptCues.length ? cuesToText(transcriptCues) : 'Transcript unavailable';

  const title = videoDetails.title || doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || doc.title || 'YouTube Video';
  const description = videoDetails.shortDescription || doc.querySelector('meta[property="og:description"]')?.getAttribute('content') || '';

  const combinedText = [description, transcriptText].filter(Boolean).join('\n\n');

  const words = combinedText.split(/\s+/).filter(Boolean);

  const scraped: ScrapedContent = {
    text: combinedText,
    markdown: `# ${title}\n\n${combinedText}`,
    title,
    excerpt: combinedText.slice(0, 200) + (combinedText.length > 200 ? '...' : ''),
    metadata: {
      hostname: new URL(pageUrl).hostname,
      url: pageUrl,
      title,
      byline: null,
      dir: null,
      lang: doc.documentElement.lang || null,
      contentLength: combinedText.length,
      wordCount: words.length,
      readingTimeMinutes: Math.max(1, Math.ceil(words.length / 200)),
      hasContent: combinedText.length > 0,
      extractionMethod,
      shadowDOMCount: 0,
      iframeCount: doc.querySelectorAll('iframe').length,
      readabilityScore: 0, // N/A for video transcripts
      contentDensity: 0,
      isArticle: false,
      publishedTime: null,
      siteName: 'YouTube',
      fallbackUsed,
      debugInfo: {
        originalLength: doc.body?.textContent?.length || 0,
        cleanedLength: combinedText.length,
        removedElements: [],
        contentSelectors: [extractionMethod],
        imageCount: doc.querySelectorAll('img').length,
        linkCount: doc.querySelectorAll('a').length,
        paragraphCount: doc.querySelectorAll('p').length,
      },
    },
    comments: [],
    transcriptCues,
  };

  console.log('Sol:[YouTube Scraper] Finished – cues:', transcriptCues.length);
  return scraped;
}

/** Parse timestamps like "1:23" or "01:02:03" to seconds */
function parseTimestampToSeconds(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(':').map(Number).filter(n => !isNaN(n));
  if (!parts.length) return 0;
  let seconds = 0;
  for (let i = 0; i < parts.length; i++) {
    const value = parts[parts.length - 1 - i];
    seconds += value * Math.pow(60, i);
  }
  return seconds;
}

/**
 * Plugin definition ────────────────────────────────────────────────────────
 */
const youtubePlugin: ScraperPlugin = {
  name: 'YouTube',
  version: '1.1.0',
  description: 'Scrapes YouTube video metadata and captions/transcripts',
  hostPatterns: [/youtube\.com\/(watch|shorts)/, /youtu\.be\//],
  priority: 85,
  scraper: scrapeYouTube,
};

export default youtubePlugin; 