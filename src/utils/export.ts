import { Conversation } from '../services/storage';
import conversation from '../services/conversation';

// ============================================================================
// EXPORT UTILS (was ExportService)
// ============================================================================

export class ExportUtil {
  private static instance: ExportUtil;
  private constructor() {}

  static getInstance(): ExportUtil {
    if (!this.instance) {
      this.instance = new ExportUtil();
    }
    return this.instance;
  }

  // Convert single conversation to markdown
  exportConversationToMarkdown(conv: Conversation): string {
    let md = `# ${conv.title}\n\n`;
    md += `**Created:** ${new Date(conv.createdAt).toLocaleString()}\n`;
    md += `**Updated:** ${new Date(conv.updatedAt).toLocaleString()}\n`;
    md += `**URL:** ${conv.url}\n\n---\n\n`;

    conv.messages.forEach((msg, idx) => {
      const role = msg.type === 'user' ? '👤 **User**' : '🤖 **Assistant**';
      md += `## ${role}\n\n${msg.content}\n\n`;
      if (idx < conv.messages.length - 1) md += `---\n\n`;
    });
    return md;
  }

  // All conversations to markdown
  async exportAllConversationsToMarkdown(): Promise<string> {
    const convs = await conversation.getConversations();
    let md = `# Sol Conversations Export\n\n`;
    md += `**Exported:** ${new Date().toLocaleString()}\n`;
    md += `**Total Conversations:** ${convs.length}\n\n---\n\n`;
    convs.forEach((c, idx) => {
      md += this.exportConversationToMarkdown(c);
      if (idx < convs.length - 1) md += `\n\n---\n\n`;
    });
    return md;
  }

  // Helpers to download markdown
  private downloadMarkdown(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async downloadConversation(convId: string) {
    const conv = await conversation.getConversation(convId);
    if (!conv) throw new Error('Conversation not found');
    const md = this.exportConversationToMarkdown(conv);
    const fname = `sol-conversation-${conv.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${Date.now()}.md`;
    this.downloadMarkdown(md, fname);
  }

  async downloadAllConversations() {
    const md = await this.exportAllConversationsToMarkdown();
    const fname = `sol-all-conversations-${Date.now()}.md`;
    this.downloadMarkdown(md, fname);
  }
}

const exportUtil = ExportUtil.getInstance();
export default exportUtil; 