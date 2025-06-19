import React from 'react';
import ReactMarkdown from 'react-markdown';

interface MessageRendererProps {
  content: string;
  className?: string;
}

export const MessageRenderer: React.FC<MessageRendererProps> = ({ 
  content, 
  className = '' 
}) => {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
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
          
          // Blockquotes (including custom quote tags)
          blockquote: ({ children }) => (
            <blockquote className="border-l-3 border-black/10 pl-3 my-2 italic text-black/60">
              {children}
            </blockquote>
          ),
          
          // Clean paragraph styling
          p: ({ children }) => <p className="text-base leading-relaxed mb-2 last:mb-0">{children}</p>,
          
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
        {content.replace(/<quote>(.*?)<\/quote>/g, '> $1')}
      </ReactMarkdown>
    </div>
  );
};

export default MessageRenderer; 