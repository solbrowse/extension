import React from 'react';
import Markdown from 'markdown-to-jsx';
import temml from 'temml';
import tagRegistry from '../customTags';
import CodeBlock from '../ui/CodeBlock';

interface MessageRendererProps {
  content: string;
  className?: string;
}

const MarkdownComponents = {
  // Style headings
  h1: ({ children, ...props }: any) => <h1 className="sol-markdown h1" {...props}>{children}</h1>,
  h2: ({ children, ...props }: any) => <h2 className="sol-markdown h2" {...props}>{children}</h2>,
  h3: ({ children, ...props }: any) => <h3 className="sol-markdown h3" {...props}>{children}</h3>,
  h4: ({ children, ...props }: any) => <h4 className="sol-markdown h4" {...props}>{children}</h4>,
  h5: ({ children, ...props }: any) => <h5 className="sol-markdown h5" {...props}>{children}</h5>,
  h6: ({ children, ...props }: any) => <h6 className="sol-markdown h6" {...props}>{children}</h6>,
  
  // Clean list styling
  ul: ({ children, ...props }: any) => <ul className="sol-markdown ul" {...props}>{children}</ul>,
  ol: ({ children, ...props }: any) => <ol className="sol-markdown ol" {...props}>{children}</ol>,
  li: ({ children, ...props }: any) => <li className="sol-markdown li" {...props}>{children}</li>,
  
  // Paragraphs
  p: ({ children, ...props }: any) => <p className="sol-markdown text-base leading-relaxed mb-2 last:mb-0" {...props}>{children}</p>,
  
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
          return <code className="sol-markdown code" {...props}>{content}</code>;
        }
      }
      
      return <code className="sol-markdown code" {...props}>{children}</code>;
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
          <pre className="sol-markdown pre">
            <code className="sol-markdown code" {...props}>{children}</code>
          </pre>
        );
      }
    }
    
    // Default highlighted block via Prism + copy button
    return <CodeBlock code={String(children).replace(/\n$/, '')} language={language} />;
  },
  
  // Blockquotes
  blockquote: ({ children, ...props }: any) => (
    <blockquote className="sol-markdown blockquote" {...props}>
      {children}
    </blockquote>
  ),
  
  // Links
  a: ({ href, children, ...props }: any) => (
    <a 
      href={href} 
      target="_parent" 
      rel="noopener noreferrer"
      className="sol-markdown a"
      {...props}
    >
      {children}
    </a>
  ),

  // Tables
  table: ({ children, ...props }: any) => (
    <div className="sol-markdown">
      <table className="sol-markdown table" {...props}>
        {children}
      </table>
    </div>
  ),
  
  thead: ({ children, ...props }: any) => (
    <thead {...props}>
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
    <th className="sol-markdown th" {...props}>
      {children}
    </th>
  ),
  
  td: ({ children, ...props }: any) => (
    <td className="sol-markdown td" {...props}>
      {children}
    </td>
  ),
};

export const MessageRenderer: React.FC<MessageRendererProps> = React.memo(({ 
  content, 
  className = '' 
}) => {
  // Helper to render plain markdown
  const renderPlainSegment = (segment: string, key: string) => (
    <Markdown key={key} options={{ overrides: MarkdownComponents }}>
      {segment}
    </Markdown>
  );

  const processedContent = content; // No legacy <quote> replacement needed

  const nodes = React.useMemo(() => {
    const pluginRegex = /<sol:([a-zA-Z]+)>([\s\S]*?)(?:<\/sol:\1>|$)/g;
    const out: React.ReactNode[] = [];
    let last = 0;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = pluginRegex.exec(processedContent)) !== null) {
      const [full, tagNameRaw, inner] = m;
      const tagName = `sol:${tagNameRaw}`;
      if (m.index > last) {
        out.push(renderPlainSegment(processedContent.substring(last, m.index), `seg-${idx++}`));
      }
      const plugin = tagRegistry.get(tagName);
      if (plugin) {
        out.push(plugin.render(plugin.parse(inner), `plugin-${idx++}`));
      } else {
        out.push(renderPlainSegment(full, `raw-${idx++}`));
      }
      last = m.index + full.length;
    }
    if (last < processedContent.length) {
      out.push(renderPlainSegment(processedContent.substring(last), `seg-${idx++}`));
    }
    return out;
  }, [processedContent]);

  return <div className={`sol-markdown ${className}`}>{nodes}</div>;
});

export default MessageRenderer; 