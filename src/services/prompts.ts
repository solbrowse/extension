import systemPromptTemplate from '../prompts/system-prompt.txt?raw';

/**
 * Creates a structured system prompt for the AI assistant.
 * This prompt defines the AI's role, rules, and the context it should use.
 */
export function createSystemPrompt(context: { url: string, title: string, content: string }): string {
  const pageContext = `
<context>
  <website>${context.url}</website>
  <title>${context.title}</title>
  <content>
    ${context.content}
  </content>
</context>
  `.trim();

  // Replace placeholders in the template
  const prompt = systemPromptTemplate
    .replace('{{URL}}', context.url)
    .replace('{{TITLE}}', context.title)
    .replace('{{CONTENT}}', context.content);

  return `${prompt}\n\n${pageContext}`;
}