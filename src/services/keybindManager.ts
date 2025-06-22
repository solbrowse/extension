export interface KeybindOptions {
  keybind: string; // e.g. "Cmd+F"
  isEnabled: () => boolean;
  isVisible: () => boolean;
  show: () => Promise<void>;
  hide: () => void;
  log?: (...args: any[]) => void;
}

/* Helper */
interface ParsedKeybind {
  key: string | undefined;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

function parseKeybind(keybindString: string): ParsedKeybind {
  const parts = keybindString.replace(/\s/g, '').split('+');
  const key = parts.pop()?.toLowerCase();

  const modifiers = {
    metaKey: parts.some(p => ['cmd', 'meta', 'win', 'command'].includes(p.toLowerCase())),
    ctrlKey: parts.some(p => ['ctrl', 'control'].includes(p.toLowerCase())),
    altKey: parts.some(p => ['alt', 'option'].includes(p.toLowerCase())),
    shiftKey: parts.some(p => ['shift'].includes(p.toLowerCase())),
  };
  
  return { key, ...modifiers };
}

function matchesKeybind(event: KeyboardEvent, keybind: ParsedKeybind): boolean {
  return (
    event.key.toLowerCase() === keybind.key &&
    event.metaKey === keybind.metaKey &&
    event.ctrlKey === keybind.ctrlKey &&
    event.altKey === keybind.altKey &&
    event.shiftKey === keybind.shiftKey
  );
} 

/**
 * Global toggle keybind handler. Returns disposer function.
 */
export function attachToggleKeybind({ keybind, isEnabled, isVisible, show, hide, log = () => {} }: KeybindOptions): () => void {
  const parsed = parseKeybind(keybind);

  let handlerHandledInKeydown = false;

  const handler = async (event: KeyboardEvent) => {
    if (!isEnabled()) return;
    if (!matchesKeybind(event, parsed)) return;

    // Prefer keydown if it reaches us; otherwise fall back to keyup.
    // If we've already handled the current physical key press during the
    // keydown phase, ignore the subsequent keyup.
    if (event.type === 'keyup' && handlerHandledInKeydown) {
      return;
    }

    if (event.type === 'keydown') {
      handlerHandledInKeydown = true;
    }

    log('Sol KeybindManager: Shortcut pressed', {
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    });

    event.preventDefault();
    event.stopPropagation();

    if (!isVisible()) {
      await show();
    } else {
      hide();
    }

    // Reset the state after the run loop so the next key press is handled.
    if (event.type === 'keyup') {
      handlerHandledInKeydown = false;
    }
  };

  // Some sites (e.g. GitHub) aggressively stopImmediatePropagation on keydown
  // events in the capture phase.  To ensure reliability we also register a
  // keyup listener which in practice is left untouched by page scripts.
  document.addEventListener('keydown', handler, { capture: true, passive: false });
  document.addEventListener('keyup', handler, { capture: true, passive: false });
  log('Sol KeybindManager: Listener attached', { keybind });

  return () => {
    document.removeEventListener('keydown', handler, { capture: true });
    document.removeEventListener('keyup', handler, { capture: true });
    log('Sol KeybindManager: Listener detached');
  };
} 