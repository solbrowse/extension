# Sol Plugin Systems

This repo contains **two** small, self-contained plugin mechanisms:

1. **Scraping plugins** – enrich the background scraper with site-specific logic.
2. **Custom-tag render plugins** – render `<sol:* />` tags inside chat messages.

Both follow the same philosophy: _small, isolated files registered via a central registry_. The code base never needs to be touched again when you add a new plugin.

---

## 1 Scraping Plugins `src/services/scraping/plugins/*`

```
src/services/scraping/
  plugins/
    youtube.ts     // → extracts transcript, description
  pluginRegistry.ts
```

**Contract** (`ScrapePlugin`)

```ts
export interface ScrapePlugin {
  /** Return `true` if this plugin can handle the current URL. */
  matches(url: URL): boolean;
  /** Return a serialisable object with any data you want. */
  scrape(document: Document, url: URL): Promise<PageSnapshot>;
}
```

- Implement a file that exports one object that satisfies the interface.
- Register it in `pluginRegistry.ts`:
  ```ts
  import github from "./plugins/github";
  registry.register(github);
  ```

The background scraper loops over `registry.list()` and uses the _first_ plugin whose `matches()` returns `true`.

---

## 2 Custom-Tag Render Plugins `src/components/customTags/plugins/*`

```
src/components/customTags/
  TagPlugin.ts         // → interface
  registry.ts          // → singleton registry
  plugins/
    draft.tsx          // <sol:draft>…</sol:draft>
    quickAnswer.tsx    // <sol:quickAnswer>…</sol:quickAnswer>
    image.tsx          // <sol:image>…</sol:image>
    quote.tsx          // <sol:quote>…</sol:quote>
  ui/                  // shared React building blocks
    DraftBlock.tsx
    QuickAnswerBanner.tsx
    ImageSearchBlock.tsx
  index.ts             // registers default plugins
```

### Interface

```ts
export interface TagPlugin<ParseOut = any> {
  /** Tag name, e.g. "sol:draft" */
  tagName: string;
  /** Convert raw inner-HTML to structured data */
  parse(raw: string): ParseOut;
  /** Return a *memoised* React node */
  render(parsed: ParseOut, key: string): React.ReactNode;
}
```

### Life-cycle

1. **MessageRenderer** scans the streaming text with one regex.  
   As soon as `<sol:foo>` is detected the plugin is invoked – _no closing tag required_, so blocks render **live**.
2. The plugin's `render()` returns a React component which stays mounted; MessageRenderer just updates its props when new text streams in.
3. Because each UI component is wrapped in `React.memo`, no unnecessary re-renders occur.

### Adding a New Tag

1. Create `src/components/customTags/plugins/myTag.tsx`:

   ```tsx
   import React from "react";
   import { TagPlugin } from "../TagPlugin";

   const MyTagPlugin: TagPlugin<string> = {
     tagName: "sol:myTag",
     parse: (raw) => raw.trim(),
     render: (payload, key) => <div key={key}>{payload}</div>,
   };

   export default MyTagPlugin;
   ```

2. Export a UI component if needed under `ui/`.
3. Register it in `customTags/index.ts`:
   ```ts
   import MyTagPlugin from "./plugins/myTag";
   registry.register(MyTagPlugin);
   ```
4. Done – no core changes; hot-reloading shows your new block immediately.

---

### Streaming-Friendly Tips

- Keep `render()` pure and cheap. Heavy side-effects go inside `useEffect` of the child component (see `ImageSearchBlock`).
- Always supply the `key` passed to `render()` to the root element – this keeps React diffing stable.
- Wrap your UI component in `React.memo` if its content only changes through props.

---

Happy hacking! 🎉
