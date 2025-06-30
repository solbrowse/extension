export interface TagPlugin<ParseOut = any> {
  /** Full tag name, e.g. "sol:draft" */
  tagName: string;

  /**
   * Parse the raw inner text of the tag and return structured data for rendering.
   * For simple tags you can just return the string.
   */
  parse(raw: string): ParseOut;

  /**
   * Render the parsed payload into a React node.
   * `key` must be applied to the root element for list rendering.
   */
  render(parsed: ParseOut, key: string): React.ReactNode;
} 