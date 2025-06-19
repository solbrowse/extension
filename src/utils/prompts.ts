import systemPromptTemplate from '../assets/prompts/system-prompt.txt?raw';

/**
 * Creates the system prompt for the AI assistant.
 * This prompt defines the AI's role and rules.
 */
export function createSystemPrompt(): string {
  return systemPromptTemplate;
}

/**
 * Creates a website context message to be sent as a separate user message.
 * This contains all the webpage data in a structured format.
 */
export function createWebsiteContext(context: { 
  url: string; 
  title: string; 
  content: string; 
  markdown?: string;
  excerpt?: string;
  metadata?: any;
}): string {
  // Use markdown version if available for better LLM processing
  const contentToUse = context.markdown || context.content;
  
  return `<website>
  <url>${context.url}</url>
  <title>${context.title}</title>
  ${context.excerpt ? `<excerpt>${context.excerpt}</excerpt>` : ''}
  ${context.metadata ? `<metadata>
    <extraction_method>${context.metadata.extractionMethod || 'unknown'}</extraction_method>
    <content_type>${context.metadata.isArticle ? 'article' : 'general'}</content_type>
    <word_count>${context.metadata.wordCount || 0}</word_count>
  </metadata>` : ''}
  <content format="${context.markdown ? 'markdown' : 'text'}">
${contentToUse}
  </content>
</website>`;
}