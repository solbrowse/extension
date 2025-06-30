import React from 'react';
import { TagPlugin } from '../TagPlugin';
import QuickAnswerBanner from '../ui/QuickAnswerBanner';

const QuickAnswerPlugin: TagPlugin<string> = {
  tagName: 'sol:quickAnswer',
  parse: (raw) => raw.trim(),
  render: (content, key) => <QuickAnswerBanner key={key} text={content} />
};

export default QuickAnswerPlugin; 