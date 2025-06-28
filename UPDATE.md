# Sol Extension – Architecture Refactor (🚧 Finalised Plan)

> This document aggregates insights from **intern3.chat** and adapts them for **Sol**, a 100 % local browser-extension. It enumerates every subsystem we'll touch, the strategies we'll adopt, and the concrete file targets / new modules to introduce.

---

## 0 • Key Goals

1. Fluid, low-jank rendering for long chats
2. Resilient, indexed storage that survives crashes & migrations
3. Correct, resumable streaming bound to the originating conversation
4. Hard performance budgets that fit extension sand-boxes
5. Secure, extensible renderer pipeline

---

## 1 • Rendering & UX

| Action                                            | File(s)                                                                                                                                        | Notes                                                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Create `src/components/chat/MemoisedMessages.tsx` | NEW                                                                                                                                            | Wrapper around `<Messages>` that memoises each message & throttles streaming rerenders ≤ 50 ms using `useThrottle`. |
| Extract per-part renderers                        | `Messages.tsx → src/components/chat/renderers/*`                                                                                               | Follow intern3 `PartsRenderer`; each renderer exported as React.memo.                                               |
| Replace virtual scroll                            | Remove planned `react-virtualized`; instead integrate **use-stick-to-bottom** (light 1 kB lib) — stick only when user is scrolled near bottom. |
| Add Codeblock/Markdown implementations            | Port trimmed version of `Codeblock.tsx`, `MemoizedMarkdown.tsx` (already provided) into `src/components/chat/markdown/`.                       |

### Budgets

• < 8 ms main-thread per frame (Chrome extension world) • Peak JS heap < 25 MB • 60 fps scroll with 5 k messages.

---

## 2 • Storage Layer

| Action                            | File(s)                                                                          | Notes                                                    |
| --------------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Introduce **IndexedDB** via Dexie | NEW `src/services/db.ts`                                                         | DB = `sol_chat_v1`; stores: `conversations`, `messages`. |
| Conversation schema               | `{ id, title, createdAt, updatedAt, metadata }`.                                 |
| Message schema (denormalised)     | `{ id, convId, idx, type: 'user'                                                 | 'assistant', parts: Part[], timestamp, streamId? }`.     |
| Migration scaffold                | `db.ts` v2->v3 hooks.                                                            |
| Update `ConversationService.ts`   | READ/WRITE through Dexie, not chrome.storage; keep in-mem cache for active conv. |
| Broadcast updates                 | Add `src/services/sync.ts` wrapper around `BroadcastChannel` + storage events.   |
| Linear edit history               | On edit: delete `idx > target` then append; keep monotonic `idx`.                |

---

## 3 • Streaming / Messaging

| Action               | File(s)                                                                                                           | Notes                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Extend Port protocol | `src/services/messaging/uiPortService.ts` + background                                                            | Include `{ convId, streamId, idx }` in DELTA / DONE / ERROR. |
| Fix mis-routing      | `useSimpleChat.ts` already partially patched; ensure `convId` passed to `chatActions.sendMessage` and propagated. |
| Abort/back-pressure  | UI counts unprocessed deltas; on overflow sends `SLOW_CLIENT`; background pauses via `AbortController`.           |
| Persist stream meta  | Add `streamId` to Dexie `conversations` row for resume on reload.                                                 |

---

## 4 • Performance & Telemetry

| Action                | File(s)                                                                                                         | Notes                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Perf budget constants | `src/config/perf.ts`                                                                                            | `{ FRAME_BUDGET_MS: 8, MAX_HEAP_MB: 25 }`. |
| TPS metric            | In `useSimpleChat` record startTime & tokens count; log via `performance.mark` & a new devtools panel (future). |
| Memory watcher        | background interval logs `performance.memory.usedJSHeapSize` → console when debug flag enabled.                 |

---

## 5 • Security & Extensibility

| Action             | File(s)                                                                                          | Notes |
| ------------------ | ------------------------------------------------------------------------------------------------ | ----- |
| Markdown sanitiser | Reuse `rehype-sanitize` schema from intern3; put in `src/components/chat/markdown/sanitiser.ts`. |
| Plugin registry    | NEW `src/components/chat/plugins/index.ts` → allows registering `{type, Renderer}` pairs.        |
| Audit renderer     | Ensure `dangerouslySetInnerHTML` only used inside Codeblock's shiki container with CSS scoping.  |

---

## 6 • Cleanup & Migration Steps

1. Add Dexie DB, run migration script to copy existing `chrome.storage.local.conversations` → IndexedDB.
2. Patch `ConversationService`, `useConversationService` to use Dexie & sync.
3. Update background & UI port payloads (convId/streamId).
4. Replace old message list with MemoisedMessages & per-part renderers.
5. Remove unused askbar-page components previously marked for deletion.
6. Toggle feature flag `debug` ➜ show performance overlay.

---

_Last updated: 2025-06-28_
