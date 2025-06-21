import React from 'react';
import ReactMarkdown from 'react-markdown';
import { UiPortService } from '@src/services/messaging/uiPortService';

interface MessageRendererProps {
  content: string;
  className?: string;
}

// Component to render inline tab mentions in messages
const InlineTabRenderer: React.FC<{ content: string }> = ({ content }) => {
  const [availableTabs, setAvailableTabs] = React.useState<any[]>([]);

  React.useEffect(() => {
    // Load tabs for rendering mentions
    const loadTabs = async () => {
      try {
        const tabs = await UiPortService.getInstance().listTabs();
        setAvailableTabs(tabs);
      } catch (error) {
        console.error('Failed to load tabs for message rendering:', error);
      }
    };
    loadTabs();
  }, []);

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
          <span key={`unknown-${match.index}`} className="inline-flex items-center mx-0.5 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-sm">
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
};

export const MessageRenderer: React.FC<MessageRendererProps> = ({ 
  content, 
  className = '' 
}) => {
  // Check if content contains tab mentions
  const hasTabMentions = /@tab:\d+:[^@]*?:/.test(content);

  // Process content to replace tab mentions with inline rendering
  const processedContent = hasTabMentions ? content : content;

  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          // Handle paragraphs with potential tab mentions
          p: ({ children }) => {
            const textContent = React.Children.toArray(children).join('');
            
            if (hasTabMentions && typeof textContent === 'string' && /@tab:\d+:[^@]*?:/.test(textContent)) {
              return (
                <p className="text-base leading-relaxed mb-2 last:mb-0">
                  <InlineTabRenderer content={textContent} />
                </p>
              );
            }
            
            return <p className="text-base leading-relaxed mb-2 last:mb-0">{children}</p>;
          },
          
          // Handle text nodes that might contain tab mentions
          text: ({ children }) => {
            if (hasTabMentions && typeof children === 'string' && /@tab:\d+:[^@]*?:/.test(children)) {
              return <InlineTabRenderer content={children} />;
            }
            return <>{children}</>;
          },

          // Style headings with minimal design
          h1: ({ children }) => <h3 className="text-base font-semibold text-gray-900 mt-4 mb-2 first:mt-0">{children}</h3>,
          h2: ({ children }) => <h4 className="text-sm font-semibold text-gray-900 mt-3 mb-2 first:mt-0">{children}</h4>,
          h3: ({ children }) => <h5 className="text-sm font-medium text-gray-900 mt-3 mb-1 first:mt-0">{children}</h5>,
          h4: ({ children }) => <h6 className="text-sm font-medium text-gray-800 mt-2 mb-1 first:mt-0">{children}</h6>,
          h5: ({ children }) => <h6 className="text-sm text-gray-800 mt-2 mb-1 first:mt-0">{children}</h6>,
          h6: ({ children }) => <span className="text-sm text-gray-700 font-medium">{children}</span>,
          
          // Clean list styling
          ul: ({ children }) => <ul className="list-disc list-inside space-y-1 ml-2 my-2">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal list-inside space-y-1 ml-2 my-2">{children}</ol>,
          li: ({ children }) => <li className="text-base leading-relaxed">{children}</li>,
          
          // Inline code and code blocks
          code: ({ node, children, className, ...props }) => {
            const isInline = !className?.includes('language-');
            return isInline ? (
              <code className="bg-black/5 text-black/80 px-1.5 py-0.5 rounded text-sm font-mono" {...props}>{children}</code>
            ) : (
              <pre className="bg-black/5 p-3 rounded-lg my-2 overflow-x-auto">
                <code className="text-sm font-mono text-black/80">{children}</code>
              </pre>
            );
          },
          
          // Blockquotes
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-black/10 pl-3 my-2 italic text-black/60">
              {children}
            </blockquote>
          ),
          
          // Strong and emphasis
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          
          // Links with external indicator
          a: ({ href, children }) => (
            <a 
              href={href} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-600 hover:text-gray-800 underline decoration-1 underline-offset-2"
            >
              {children}
            </a>
          ),
        }}
      >
        {processedContent.replace(/<quote>(.*?)<\/quote>/g, '> $1')}
      </ReactMarkdown>
    </div>
  );
};

export default MessageRenderer; 