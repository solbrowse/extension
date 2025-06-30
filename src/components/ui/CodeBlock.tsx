import React, { useEffect, useRef, useState } from 'react';
import Prism from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-python';
import 'prismjs/themes/prism.css'; // You can swap this for a custom theme later

interface CodeBlockProps {
  code: string;
  language?: string;
  blockKey?: string;
}

/**
 * Lightweight, client-side syntax-highlighted code block with copy button.
 * Designed for Chrome-extension context – no runtime web-workers, minimal imports.
 */
const CodeBlock: React.FC<CodeBlockProps> = ({ code, language = '', blockKey }) => {
  const codeRef = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);

  // Highlight once mounted / whenever code or language changes
  useEffect(() => {
    if (codeRef.current) {
      Prism.highlightElement(codeRef.current);
    }
  }, [code, language]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.warn('Sol CodeBlock: copy failed', err);
    }
  };

  return (
    <div key={blockKey} className="relative my-4 group">
      <button
        onClick={handleCopy}
        className={`absolute top-2 right-2 text-xs px-2 py-1 rounded-md border transition-colors backdrop-blur-sm bg-white/60 hover:bg-black/80 hover:text-white ${
          copied ? 'bg-emerald-600 text-white' : 'text-black/60'
        }`}
        title={copied ? 'Copied!' : 'Copy to clipboard'}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre className="sol-code-block overflow-x-auto rounded-lg border border-black/10 bg-slate-50 p-4 text-[13px] leading-tight">
        <code ref={codeRef} className={`language-${language}`}>{code}</code>
      </pre>
    </div>
  );
};

export default React.memo(CodeBlock); 