import React from 'react';
import { TagPlugin } from '../TagPlugin';
import ImageSearchBlock from '../ui/ImageSearchBlock';

const ImagePlugin: TagPlugin<string> = {
  tagName: 'sol:image',
  parse: (raw) => raw.trim(),
  render: (query, key) => <ImageSearchBlock key={key} query={query} />
};

export default ImagePlugin; 