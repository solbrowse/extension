# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sol is a browser extension that brings AI capabilities to web browsing. It provides context-aware assistance across browser tabs using content scraping, multi-tab context queries, and a pluggable scraper system for different websites.

## Development Commands

### Build Commands
- `npm run build` - Build for Chrome (default)
- `npm run build:chrome` - Build specifically for Chrome  
- `npm run build:firefox` - Build specifically for Firefox

### Development Commands
- `npm run dev` - Start development mode for Chrome (default)
- `npm run dev:chrome` - Start development mode for Chrome with file watching
- `npm run dev:firefox` - Start development mode for Firefox with file watching

Development uses nodemon with browser-specific configurations (nodemon.chrome.json, nodemon.firefox.json) for hot reloading.

## Architecture Overview

### Browser Extension Structure
Sol is a Manifest V3 browser extension with these main components:

**Core Pages:**
- **Dashboard** (`src/pages/dashboard/`) - Main settings and configuration UI
- **Popup** (`src/pages/popup/`) - Browser action popup interface  
- **AskBar** (`src/pages/askbar/`) - Injected overlay interface for asking questions
- **Sidebar** (`src/pages/sidebar/`) - Expandable sidebar for extended conversations
- **NewTab** (`src/pages/newtab/`) - Custom new tab page

**Background Services:**
- **Background Script** (`src/scripts/background/`) - Service worker handling API calls, tab management, and message routing
- **Content Scripts** (`src/scripts/content/`) - Injected into web pages to handle scraping and UI controllers

### Key Service Architecture

**Messaging System:**
- **PortManager** (`src/services/messaging/portManager.ts`) - Centralized message routing between content scripts, UI components, and background
- Uses Chrome extension port-based communication with typed message interfaces

**Content Scraping:**
- **ScraperController** - Handles real-time content extraction from web pages
- **PluginRegistry** (`src/services/scraping/pluginRegistry.ts`) - Extensible system for site-specific scrapers (GitHub, YouTube, Wikipedia)
- **SnapshotManager** - Manages versioned, compressed content snapshots with change detection

**AI Integration:**
- **ApiService** (`src/services/api.ts`) - Unified interface supporting multiple AI providers (OpenAI, OpenRouter, Google Gemini, Mistral, custom endpoints)
- Streaming chat completions with abort support
- Provider-specific model management

**Storage & State:**
- **Storage Service** (`src/services/storage.ts`) - Chrome extension storage with schema versioning
- **Conversation Service** (`src/services/conversation.ts`) - Persistent conversation history management

### UI Architecture

**Framework:** React 19 + TypeScript + Tailwind CSS + Vite

**Component Structure:**
- `src/components/ui/` - Reusable UI components (buttons, inputs, tabs, etc.)
- `src/components/shared/` - Chat-specific shared components (MessageItem, InputArea, etc.)
- `src/components/hooks/` - Custom React hooks for chat, conversations, and input handling

**Theming:**
- Dark/light mode support via `useTheme` hook
- Theme persistence across extension pages

### Build System

**Multi-Browser Support:**
- Separate Vite configurations for Chrome (`vite.config.chrome.ts`) and Firefox (`vite.config.firefox.ts`)
- Base configuration shared via `vite.config.base.ts`
- Browser-specific manifest files

**Key Build Features:**
- TypeScript with path mapping (`@src/*` aliases)
- Tailwind CSS with Vite plugin
- Hot reloading in development via nodemon
- Source maps in development builds

## Multi-Tab Context System

Sol's core feature is the ability to query across multiple browser tabs using `@tabName` syntax. The system:

1. **Content Scraping** - Each tab's content is automatically scraped and cached
2. **Tab References** - Users can reference specific tabs in queries using `@` mentions
3. **Context Assembly** - Background script assembles content from referenced tabs into AI context
4. **Real-time Updates** - Content snapshots are updated as pages change (SPA support)

## Plugin System

The scraper system is extensible via plugins in `src/services/scraping/plugins/`:
- **github.ts** - Enhanced GitHub page scraping
- **wikipedia.ts** - Wikipedia article extraction  
- **youtube.ts** - YouTube video/channel scraping

New plugins implement the `PluginScraper` interface and register with priority-based matching.

## Configuration

**Storage Schema:** 
- Versioned storage with automatic migration via `needsSchemaReset()`
- Settings stored in Chrome extension storage API
- Conversation history with Dexie.js IndexedDB wrapper

**Feature Flags:**
- AskBar (overlay interface) with configurable keybinds and positioning
- Debug mode for verbose logging
- Theme preferences

## Development Notes

- All console logs are prefixed with "Sol" for easy filtering
- Debug mode can be enabled in Dashboard settings for verbose logging
- Extension supports both Chrome and Firefox with build-time differences handled
- Content scripts detect and avoid execution in extension contexts
- Cleanup handlers prevent memory leaks on tab navigation/closure