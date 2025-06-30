import registry from './registry';
import DraftPlugin from './plugins/draft';
import QuickAnswerPlugin from './plugins/quickAnswer';
import ImagePlugin from './plugins/image';
import QuotePlugin from './plugins/quote';

// Register default plugins
registry.register(DraftPlugin);
registry.register(QuickAnswerPlugin);
registry.register(ImagePlugin);
registry.register(QuotePlugin);

export default registry; 