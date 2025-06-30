![Sol Logo](public/icon-128.png)
# Sol

[![Version](https://img.shields.io/badge/version-0.4.0-blue)](#)
[![License](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-blue)](LICENSE)

A browser extension that brings AI into your browsing experience.

## Features
- **Multi-tab context**: Query across tabs with `@tabName`
- **Real-time scraping**: Captures dynamic page content (SPA support)
- **Abilities**: Custom snippets of prompts that can be added quickly using a /
- **Plugin system**: Built-in scrapers for popular sites, extendable via custom plugins
- **Caching**: Versioned, compressed content for instant responses

## Quick Start

1. **Build**  
   ```bash
   git clone https://github.com/solbrowse/extension
   cd extension
   npm install
   npm run dev:firefox (or dev:chrome)
    ```

2. **Install**
   * Firefox
      * Open `about:debugging`
      * Select "This Firefox"
      * Click on "Load Temporary Add-On..."
      * Select the `manifest.json` file found in the `dist_firefox` folder
   * Chrome
      * Open `chrome://extensions/`
      * Toggle "Developer Mode" on
      * Click on "Load Unpacked Extension"
      * Select the `dist_chrome` folder

3. **Configure**

   * Open the extension dashboard
   * Add your OpenAI/Anthropic API key
   * Customize keybinds and UI in Settings

4. **Use**

   * Press `Cmd+F` (Windows/Linux: `Ctrl+F` or your custom keybind)
   * Ask a question about the current page
   * Type `@` to include other tabs in your query

## Development

* **Stack**: 
    * React
    * TypeScript
    * Tailwind CSS
    * Vite
* Originally forked from the [vite-web-extension](https://github.com/JohnBra/vite-web-extension) repository

## Contributing
You are encouraged to open PRs with minor changes for the extension. As we are still in the early phases of development, we're moving a lot of the codebase around and refactoring all of the time. Keep this in mind.

## License
Released under the GNU GPLv3 license
