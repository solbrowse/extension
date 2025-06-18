import systemPromptTemplate from '../prompts/system-prompt.txt?raw';

/**
 * Creates a structured system prompt for the AI assistant.
 * This prompt defines the AI's role, rules, and the context it should use.
 */
export function createSystemPrompt(context: { 
  url: string; 
  title: string; 
  content: string; 
  markdown?: string;
  excerpt?: string;
  metadata?: any;
}): string {
  // Use markdown version if available for better LLM processing
  const contentToUse = context.markdown || context.content;
  
  const pageContext = `
<context>
  <website>${context.url}</website>
  <title>${context.title}</title>
  <content format="${context.markdown ? 'markdown' : 'text'}">
    ${contentToUse}
  </content>
  ${context.excerpt ? `<excerpt>${context.excerpt}</excerpt>` : ''}
  ${context.metadata ? `<metadata>
    extraction_method: ${context.metadata.extractionMethod || 'unknown'}
    content_type: ${context.metadata.isArticle ? 'article' : 'general'}
    reading_time: ${context.metadata.readingTimeMinutes || 0} minutes
    word_count: ${context.metadata.wordCount || 0}
    quality_score: ${Math.round(context.metadata.readabilityScore || 0)}/100
  </metadata>` : ''}
</context>
  `.trim();

  // Return the prompt with the page context (no placeholders to replace)
  return `${systemPromptTemplate}\n\n${pageContext}`;
}