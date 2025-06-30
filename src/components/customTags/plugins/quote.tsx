import React from 'react';
import { TagPlugin } from '../TagPlugin';

const QuotePlugin: TagPlugin<string> = {
  tagName: 'sol:quote',
  parse: (raw) => raw.trim(),
  render: (content, key) => (
    <blockquote key={key} className="sol-markdown blockquote border-l-4 border-gray-300 pl-4 italic text-gray-700">
      {content}
    </blockquote>
  )
};

export default QuotePlugin; 