export function isSignificant(mutation: MutationRecord): boolean {
  if (mutation.type === 'attributes') {
    const attrName = mutation.attributeName;
    return attrName !== 'style' && attrName !== 'class';
  }

  if (mutation.type === 'characterData') {
    const parent = mutation.target.parentElement;
    return !!parent && !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(parent.tagName);
  }

  if (mutation.type === 'childList') {
    const nodes = Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes));
    return nodes.some((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        return (node.textContent?.trim().length || 0) > 0;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as Element;
        return !['SCRIPT', 'STYLE', 'NOSCRIPT', 'META', 'LINK'].includes(el.tagName);
      }
      return false;
    });
  }

  return true; // default to true for any other mutation types
} 