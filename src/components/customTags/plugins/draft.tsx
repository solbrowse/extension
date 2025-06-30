import { TagPlugin } from '../TagPlugin';
import DraftBlock from '../ui/DraftBlock';

const DraftPlugin: TagPlugin<string> = {
  tagName: 'sol:draft',
  parse: (raw) => raw.trim(),
  render: (content, key) => <DraftBlock key={key} content={content} />
};

export default DraftPlugin; 