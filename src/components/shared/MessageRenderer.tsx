import React from 'react';
import Markdown from 'markdown-to-jsx';
import { UiPortService } from '@src/services/messaging/uiPortService';
import temml from 'temml';

interface MessageRendererProps {
  content: string;
  className?: string;
}

// Component to render inline tab mentions in messages
const InlineTabRenderer: React.FC<{ content: string }> = React.memo(({ content }) => {
  const [availableTabs, setAvailableTabs] = React.useState<any[]>([]);

  React.useEffect(() => {
    // Load tabs for rendering mentions only if content has tab mentions
    if (!/@tab:\d+:[^@]*?:/.test(content)) return;
    
    const loadTabs = async () => {
      try {
        const tabs = await UiPortService.getInstance().listTabs();
        setAvailableTabs(tabs);
      } catch (error) {
        console.error('Failed to load tabs for message rendering:', error);
      }
    };
    loadTabs();
  }, [content]);

  const renderContentWithInlineTags = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    const mentionRegex = /@tab:(\d+):([^@]*?):/g;
    let match;

    while ((match = mentionRegex.exec(text)) !== null) {
      const [fullMatch, tabIdStr, title] = match;
      const tabId = parseInt(tabIdStr);
      const tab = availableTabs.find(t => t.id === tabId);
      
      // Add text before the mention
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${lastIndex}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }

      // Add beautiful inline tag chip
      if (tab) {
        const truncatedTitle = title.length > 25 ? title.substring(0, 25) + '...' : title;
        parts.push(
          <span
            key={`mention-${tabId}-${match.index}`}
            className="inline-flex items-center mx-0.5 px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-200 text-sm font-medium"
            title={`Tab: ${tab.title}`}
          >
            {tab.favIconUrl && (
              <img 
                src={tab.favIconUrl} 
                alt="" 
                className="w-3 h-3 mr-1 rounded-sm flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            )}
            <span>{truncatedTitle}</span>
          </span>
        );
      } else {
        // If tab not found, show a placeholder
        parts.push(
          <span key={`unknown-${match.index}`} className="inline-flex items-center mx-0.5 px-1.5 py-0.5 bg-black/10 text-black/60 rounded text-sm">
            🗂️ {title.length > 25 ? title.substring(0, 25) + '...' : title}
          </span>
        );
      }

      lastIndex = match.index + fullMatch.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {text.substring(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  return <>{renderContentWithInlineTags(content)}</>;
});

// Custom components for markdown-to-jsx
const MarkdownComponents = {

  // Style headings
  h1: ({ children, ...props }: any) => <h3 className="text-base font-semibold text-black/90 mt-4 mb-2 first:mt-0" {...props}>{children}</h3>,
  h2: ({ children, ...props }: any) => <h4 className="text-sm font-semibold text-black/90 mt-3 mb-2 first:mt-0" {...props}>{children}</h4>,
  h3: ({ children, ...props }: any) => <h5 className="text-sm font-medium text-black/90 mt-3 mb-1 first:mt-0" {...props}>{children}</h5>,
  h4: ({ children, ...props }: any) => <h6 className="text-sm font-medium text-black/80 mt-2 mb-1 first:mt-0" {...props}>{children}</h6>,
  h5: ({ children, ...props }: any) => <h6 className="text-sm text-black/80 mt-2 mb-1 first:mt-0" {...props}>{children}</h6>,
  h6: ({ children, ...props }: any) => <span className="text-sm text-black/70 font-medium" {...props}>{children}</span>,
  
  // Clean list styling
  ul: ({ children, ...props }: any) => <ul className="list-disc list-inside space-y-1 ml-2 my-2" {...props}>{children}</ul>,
  ol: ({ children, ...props }: any) => <ol className="list-decimal list-inside space-y-1 ml-2 my-2" {...props}>{children}</ol>,
  li: ({ children, ...props }: any) => <li className="text-base leading-relaxed" {...props}>{children}</li>,
  
  // Paragraphs
  p: ({ children, ...props }: any) => <p className="text-base leading-relaxed mb-2 last:mb-0" {...props}>{children}</p>,
  
  // Enhanced inline and block code with LaTeX support using Temml
  code: ({ children, className, ...props }: any) => {
    const isInline = !className;
    const language = className?.replace('lang-', '') || '';
    
    if (isInline) {
      // Handle inline math notation
      const content = String(children);
      if (content.match(/^\$.*\$$/)) {
        const mathContent = content.slice(1, -1);
        try {
          const mathMLString = temml.renderToString(mathContent, { 
            displayMode: false,
            throwOnError: false 
          });
          return (
            <span 
              className="inline-flex items-center bg-blue-50 text-blue-800 px-2 py-1 rounded text-sm border border-blue-200 mx-0.5"
              dangerouslySetInnerHTML={{ __html: mathMLString }}
            />
          );
        } catch (error) {
          // Fallback to plain text if LaTeX parsing fails
          return <code className="bg-black/5 text-black/80 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{content}</code>;
        }
      }
      
      return <code className="bg-black/5 text-black/80 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>;
    }
    
    // Handle LaTeX code blocks
    if (language === 'latex') {
      try {
        const mathMLString = temml.renderToString(String(children), { 
          displayMode: true,
          throwOnError: false 
        });
        return (
          <div className="my-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200 overflow-x-auto">
            <div className="text-center">
              <div 
                className="inline-block bg-white px-4 py-3 rounded border border-blue-300 shadow-sm"
                dangerouslySetInnerHTML={{ __html: mathMLString }}
              />
            </div>
          </div>
        );
      } catch (error) {
        // Fallback to code block if LaTeX parsing fails
        return (
          <pre className="bg-black/5 p-3 rounded-lg my-2 overflow-x-auto">
            <code className="text-sm font-mono text-black/80" {...props}>{children}</code>
          </pre>
        );
      }
    }
    
    return (
      <pre className="bg-black/5 p-3 rounded-lg my-2 overflow-x-auto">
        <code className="text-sm font-mono text-black/80" {...props}>{children}</code>
      </pre>
    );
  },
  
  // Blockquotes
  blockquote: ({ children, ...props }: any) => (
    <blockquote className="border-l-3 border-black/10 pl-3 my-2 italic text-black/60" {...props}>
      {children}
    </blockquote>
  ),
  
  // Links
  a: ({ href, children, ...props }: any) => (
    <a 
      href={href} 
      target="_blank" 
      rel="noopener noreferrer"
      className="text-black/60 hover:text-black/80 underline decoration-1 underline-offset-2"
      {...props}
    >
      {children}
    </a>
  ),

  // Tables with dynamic sizing and responsive design
  table: ({ children, ...props }: any) => (
    <div className="my-4 overflow-x-auto">
      <table className="min-w-full bg-transparent border-collapse border border-gray-300 rounded-lg" {...props}>
        {children}
      </table>
    </div>
  ),
  
  thead: ({ children, ...props }: any) => (
    <thead className="bg-black/5" {...props}>
      {children}
    </thead>
  ),
  
  tbody: ({ children, ...props }: any) => (
    <tbody {...props}>
      {children}
    </tbody>
  ),
  
  tr: ({ children, ...props }: any) => (
    <tr {...props}>
      {children}
    </tr>
  ),
  
  th: ({ children, ...props }: any) => (
    <th 
      className="text-left text-sm font-semibold text-black/90 max-w-xs break-words" 
      {...props}
      style={{ 
        minWidth: '100px',
        maxWidth: '300px',
        width: 'auto',
        border: '1px solid rgba(0,0,0,0.15)',
        padding: '8px 12px'
      }}
    >
      <div className="whitespace-pre-wrap">
        {children}
      </div>
    </th>
  ),
  
  td: ({ children, ...props }: any) => (
    <td 
      className="text-sm text-black/80 max-w-xs break-words align-top" 
      {...props}
      style={{ 
        minWidth: '100px',
        maxWidth: '300px',
        width: 'auto',
        border: '1px solid rgba(0,0,0,0.15)',
        padding: '8px 12px'
      }}
    >
      <div className="whitespace-pre-wrap leading-relaxed">
        {children}
      </div>
    </td>
  ),
};

export const MessageRenderer: React.FC<MessageRendererProps> = React.memo(({ 
  content, 
  className = '' 
}) => {
  // Check if content contains tab mentions (memoized)
  const hasTabMentions = React.useMemo(() => /@tab:\d+:[^@]*?:/.test(content), [content]);

  // Process content to handle tab mentions and other transformations
  const processedContent = React.useMemo(() => {
    let processed = content;
    
    // Handle quote tags
    processed = processed.replace(/<quote>(.*?)<\/quote>/g, '> $1');
    
    // If has tab mentions, we need special handling
    if (hasTabMentions) {
      // For paragraphs containing tab mentions, we'll need to handle them specially
      return processed;
    }
    
    return processed;
  }, [content, hasTabMentions]);

  // If content has tab mentions, we need to handle it specially
  if (hasTabMentions) {
    // Split content by paragraphs and handle each one
    const paragraphs = processedContent.split('\n\n');
    
    return (
      <div className={className}>
        {paragraphs.map((paragraph, index) => {
          if (/@tab:\d+:[^@]*?:/.test(paragraph)) {
            return (
              <div key={index} className="text-base leading-relaxed mb-2 last:mb-0">
                <InlineTabRenderer content={paragraph} />
              </div>
            );
          }
          
          return (
            <Markdown
              key={index}
              options={{ overrides: MarkdownComponents }}
            >
              {paragraph}
            </Markdown>
          );
        })}
      </div>
    );
  }

  return (
    <div className={className}>
      <Markdown options={{ overrides: MarkdownComponents }}>
        {processedContent}
      </Markdown>
    </div>
  );
});

export default MessageRenderer; 