# Sol: Multi-Tab AI Browser Assistant

<div align="center">
<img src="public/icon-128.png" alt="Sol Logo" width="128" height="128"/>
<h2>Intelligent AI assistant that understands your entire browsing context</h2>

[![Version](https://img.shields.io/badge/version-3.0.0-blue)](#)
[![License](https://img.shields.io/badge/license-%20%20GNU%20GPLv3%20-blue)](LICENSE)

</div>

---

## ✨ What is Sol?

Sol is a powerful browser extension that brings AI directly into your browsing experience. Unlike traditional chatbots, Sol can simultaneously understand and analyze content from multiple browser tabs, giving you contextual AI assistance based on your entire browsing session.

### 🎯 Key Features

- **🔥 Multi-Tab Conversations**: Ask questions about content across multiple browser tabs simultaneously
- **⚡ Real-Time Content Scraping**: Automatically captures page content as you browse, including dynamic SPAs
- **🧩 Smart Plugin System**: 50+ built-in scrapers for popular sites (Google Docs, GitHub, Reddit, etc.)
- **💾 Intelligent Caching**: Advanced content versioning and compression for instant responses
- **🎨 Seamless UI**: Native browser integration with AskBar (Cmd+F) and sidebar panels

---

## 🚀 Quick Start

### Installation

Currently, builds are only readily available to alpha testers. You can download the source code and build the extension yourself to try it out!

### Setup

1. **Configure AI Provider**: Open extension → Dashboard → AI Provider
2. **Add API Key**: Enter your OpenAI, Anthropic, or custom endpoint API key
3. **Set Preferences**: Customize keybinds and positioning in Features tab

### First Steps

1. **Press `Cmd+F`** (or `Ctrl+F` on Windows/Linux) on any webpage
2. **Ask a question** about the current page content
3. **Try multi-tab**: Type `@` to include content from other open tabs
4. **Enjoy contextual AI** that understands your entire browsing session!

---

## 🔧 Core Features

### Multi-Tab AI Conversations

Sol's breakthrough feature is **multi-tab context awareness**. Instead of asking questions about just one page, you can:

```
Ask: "@github @docs How do I implement the API from the GitHub repo in my documentation?"
```

Sol will analyze content from both your GitHub repository tab and documentation tab to provide comprehensive answers.

#### How Multi-Tab Works:

1. **Auto-selection**: Current tab is automatically included
2. **@tab mentions**: Type `@` to see dropdown of available tabs
3. **Smart tagging**: Visual chips show which tabs are included
4. **Contextual responses**: AI receives structured content from all selected tabs

### Real-Time Content Scraping

Sol continuously monitors page content using advanced techniques:

- **🔄 Dynamic SPA Support**: Detects React, Vue, Angular navigation
- **📡 Mutation Observer**: Captures content changes in real-time
- **⚙️ Smart Debouncing**: Prevents excessive scraping (300ms intelligent delay)
- **🎯 Content Change Detection**: Only updates when meaningful changes occur (>10% threshold)

### Plugin-Based Site Intelligence

Sol includes specialized scrapers for 50+ popular websites:

| Site Category     | Examples               | What It Extracts                      |
| ----------------- | ---------------------- | ------------------------------------- |
| **Documentation** | GitHub, Stack Overflow | README files, code, issues, answers   |
| **Productivity**  | Google Docs, Notion    | Document content, comments, structure |
| **Social Media**  | Reddit, Twitter        | Posts, comments, threads              |
| **Knowledge**     | Wikipedia, Medium      | Articles, clean content, metadata     |
| **Development**   | GitLab, Bitbucket      | Code repositories, pull requests      |

### Intelligent Caching System

Sol's advanced caching provides instant responses:

- **📚 Content Versioning**: Keeps up to 5 versions per tab
- **🗜️ Smart Compression**: 20-60% size reduction for large content
- **⚡ LRU Management**: Least recently used content automatically cleaned
- **💾 Browser Storage**: Optional persistent caching across sessions

---

## 🎨 User Interface

### AskBar (Primary Interface)

Triggered with `Cmd+J` (customizable), the AskBar provides:

- **🎯 Focused Chat**: Overlay interface for quick questions
- **📍 Positioning**: Choose from 4 corner positions
- **🏷️ Tab Tags**: Visual indicators for multi-tab conversations
- **💬 Conversation History**: Automatic saving and restoration

### Dashboard (Settings & Management)

Full-featured settings panel for:

- **🤖 AI Provider Configuration**: OpenAI, Anthropic, custom endpoints
- **⌨️ Keybind Customization**: Set your preferred shortcuts
- **📜 Conversation History**: Export, manage, and search past conversations
- **🔧 Feature Toggles**: Enable/disable components as needed

---

## ⚡ Advanced Usage

### Multi-Tab Query Examples

```bash
# Compare documentation across tabs
"@docs @github How does the API in the docs differ from the implementation?"

# Analyze research across multiple sources
"@wikipedia @article1 @article2 Summarize the key differences in these articles"

# Development workflow
"@stackoverflow @github @docs Help me implement this solution from Stack Overflow"
```

### Plugin System

Sol's plugin architecture allows for custom site scrapers:

```typescript
// Example: Custom site scraper
pluginRegistry.registerScraper(/yoursite\.com/, (doc: Document) => ({
  text: doc.querySelector(".main-content")?.textContent || "",
  title: doc.title,
  metadata: {
    author: doc.querySelector(".author")?.textContent,
    publishDate: doc.querySelector(".date")?.textContent,
  },
}));
```

### Performance Optimization

Sol includes several performance features:

- **🎛️ Adaptive Throttling**: Backs off on high-mutation pages
- **📏 Payload Limits**: Content truncation for memory efficiency
- **🔄 Background Processing**: Non-blocking content processing
- **📊 Usage Statistics**: Monitor cache hit rates and performance

---

## 🛠️ Development

### Architecture

Sol uses a modern, modular architecture:

```
Sol Extension Architecture
├── 🎯 Background Service Worker
│   ├── Port-based messaging system
│   ├── Multi-tab content aggregation
│   ├── Plugin scraper registry
│   └── Intelligent caching engine
├── 📄 Content Scripts (per tab)
│   ├── Real-time content scraping
│   ├── SPA navigation detection
│   ├── MutationObserver monitoring
│   └── Keybind handling
└── 🖥️ UI Components
    ├── AskBar (iframe-based overlay)
    ├── Dashboard (full-featured settings)
    └── TabMentionInput (multi-tab interface)
```

### Built With

- **⚛️ React 19**: Modern UI components
- **📘 TypeScript**: Type-safe development
- **🎨 Tailwind CSS 4**: Utility-first styling
- **⚡ Vite**: Fast build system
- **🔌 WebExtension APIs**: Cross-browser compatibility
- **🧠 Mozilla Readability**: Content extraction fallback

### Building from Source

```bash
# Clone repository
git clone https://github.com/your-repo/sol-extension
cd sol-extension

# Install dependencies
npm install

# Development build (Chrome)
npm run dev:chrome

# Development build (Firefox)
npm run dev:firefox

# Production build
npm run build:chrome
npm run build:firefox
```

### Project Structure

```
src/
├── 📁 background/           # Service worker logic
├── 📁 content/             # Content script injection
├── 📁 pages/               # UI pages (askbar, dashboard, popup)
├── 📁 components/          # Reusable React components
├── 📁 services/            # Core business logic
│   ├── messaging/          # Port-based communication
│   ├── scraping/           # Content extraction & plugins
│   └── storage/            # Data persistence
├── 📁 utils/               # Helper functions
└── 📁 types/               # TypeScript definitions
```

---

## 🤝 Contributing

We welcome contributions! Sol is built with a modular architecture that makes adding features straightforward.

### Quick Contribution Areas

- **🧩 Plugin Scrapers**: Add support for new websites
- **🎨 UI Components**: Improve user experience
- **🧠 AI Integration**: Add new AI providers
- **🐛 Bug Fixes**: Help improve stability
- **📚 Documentation**: Enhance guides and examples

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes and test thoroughly
4. Commit with clear messages: `git commit -m 'Add amazing feature'`
5. Push to your fork: `git push origin feature/amazing-feature`
6. Open a Pull Request

---

## 🔐 Privacy & Security

Sol prioritizes user privacy:

- **🔒 Local Storage**: All settings stored locally in browser
- **🚫 No Data Collection**: Sol never sees your API keys or conversations
- **🛡️ Secure Communication**: Direct API calls from your browser
- **🎯 Minimal Permissions**: Only requests necessary browser permissions
- **📝 Open Source**: Full transparency with public codebase

---

## 📋 Roadmap

### Upcoming Features

- **🔄 Automatic Background Sync**: Cross-device conversation sync
- **🎯 Smart Summarization**: Auto-summarize long conversations
- **🔌 Plugin Marketplace**: Community-contributed site scrapers
- **📱 Mobile Support**: Browser extension for mobile browsers
- **🤖 Multiple AI Models**: Support for local AI models

### Long-term Vision

Sol aims to become the definitive AI browsing companion, transforming how users interact with web content through intelligent, context-aware assistance.

---

## 💬 Support

- **📖 Documentation**: [Sol Help Center](https://solbrowse.notion.site/)
- **🐛 Bug Reports**: [GitHub Issues](https://github.com/your-repo/issues)
- **💡 Feature Requests**: [GitHub Discussions](https://github.com/your-repo/discussions)
- **💬 Community**: [Discord Server](https://discord.gg/sol)

---

## 📄 License

Sol is open source software licensed under the [MIT License](LICENSE).

---

<div align="center">

**Built with ❤️ by the Sol team**

[Website](https://solbrowse.com) • [Documentation](https://solbrowse.notion.site/) • [GitHub](https://github.com/your-repo) • [Discord](https://discord.gg/sol)

</div>
