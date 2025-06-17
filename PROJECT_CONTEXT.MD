# Project Context for Sol Extension Development

This file provides a quick reference to the core project files of the Sol browser extension, intended to help Large Language Models (LLMs) understand the project structure and context for development tasks.

## Core Project Files

- **`src/pages/askbar/AskBar.tsx`**: The main React component for the Ask Bar UI.
- **`src/pages/askbar/askBarStyles.css`**: Stylesheet for the Ask Bar component.
- **`src/pages/askbar/index.html`**: HTML entry point for the Ask Bar iframe.
- **`src/pages/askbar/index.css`**: General styles for the Ask Bar page.
- **`src/pages/askbar/index.tsx`**: TypeScript entry point for the Ask Bar page.
- **`src/pages/background/index.ts`**: The service worker script running in the background.
- **`src/pages/content/index.tsx`**: The content script injected into web pages.
- **`src/pages/options/index.css`**: Stylesheet for the Options page.
- **`src/pages/options/index.html`**: HTML entry point for the Options page.
- **`src/pages/options/index.tsx`**: TypeScript entry point for the Options page.
- **`src/pages/options/Options.css`**: Stylesheet for the Options component.
- **`src/pages/options/Options.tsx`**: The main React component for the Options UI.
- **`src/pages/popup/index.html`**: HTML entry point for the Popup UI.
- **`src/pages/popup/index.tsx`**: TypeScript entry point for the Popup UI.
- **`src/pages/popup/Popup.tsx`**: The main React component for the Popup UI.
- **`src/services/api.ts`**: Handles API calls to various AI providers.
- **`src/services/prompts.ts`**: Manages the creation of system prompts for the AI.
- **`src/services/contentScraper.ts`**: Service for scraping content from web pages.
- **`src/utils/index.ts`**: Utility functions (re-exports from other utils).
- **`src/utils/inject.ts`**: Utility for injecting React components into the DOM.
- **`src/utils/keybind.ts`**: Utility for parsing and matching keyboard shortcuts.
- **`src/utils/storage.ts`**: Utility for managing browser local storage.
- **`manifest.dev.json`**: Development-specific manifest settings.
- **`manifest.json`**: Base manifest file for the extension.
- **`vite.config.base.ts`**: Base Vite configuration for the project.
- **`vite.config.chrome.ts`**: Vite configuration specific to Chrome builds.
- **`vite.config.firefox.ts`**: Vite configuration specific to Firefox builds.
- **`tailwind.config.js`**: Tailwind CSS configuration.
- **`README.md`**: Project README, including build process and features.
- **`src/prompts/system-prompt.txt`**: Template for the system prompt.
