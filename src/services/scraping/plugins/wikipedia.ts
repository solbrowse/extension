import { ScraperPlugin } from '../pluginScraperRegistry';
import { ScrapedContent } from '../../contentScraper';

const wikipediaScraper = (document: Document, url: string): ScrapedContent => {
  try {
    const title = document.querySelector('#firstHeading')?.textContent || document.title;
    const content = document.querySelector('#mw-content-text');
    const textRaw = content?.textContent || document.body.textContent || '';
    const cleanText = textRaw
      .replace(/\[edit\]/g, '')
      .replace(/\[\d+\]/g, '')
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
          originalLength: textRaw.length,
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

export default {
  name: 'Wikipedia',
  version: '1.0.0',
  description: 'Enhanced scraper for Wikipedia articles',
  hostPatterns: [/wikipedia\.org/],
  priority: 70,
  scraper: wikipediaScraper
} as ScraperPlugin; 