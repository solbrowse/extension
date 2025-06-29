import { ScraperPlugin } from '../pluginRegistry';
import { ScrapedContent } from '../scape';

const githubScraper = (document: Document, url: string): ScrapedContent => {
  try {
    const title = document.title;
    let text = '';
    let markdown = '';

    const readme = document.querySelector('[data-testid="readme"], #readme');
    if (readme) {
      text = readme.textContent || '';
      markdown = `# ${title}\n\n${text}`;
    }

    const issueBody = document.querySelector('.comment-body');
    if (issueBody) {
      text = issueBody.textContent || '';
      markdown = `# ${title}\n\n${text}`;
    }

    const fileContent = document.querySelector('.blob-wrapper .blob-code-inner');
    if (fileContent) {
      text = fileContent.textContent || '';
      markdown = `# ${title}\n\n\n\n\`\`\`\n${text}\n\`\`\``;
    }

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
          paragraphCount: text.split('\n').length,
        }
      }
    };
  } catch (error) {
    console.error('Sol GitHub Scraper: Error extracting content:', error);
    throw error;
  }
};

const plugin: ScraperPlugin = {
  name: 'GitHub',
  version: '1.0.0',
  description: 'Enhanced scraper for GitHub repositories and issues',
  hostPatterns: [/github\.com/],
  priority: 90,
  scraper: githubScraper
};

export default plugin; 