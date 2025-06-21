import { parseKeybind, matchesKeybind } from '@src/utils/keybind';

export interface KeybindOptions {
  keybind: string; // e.g. "Cmd+F"
  isEnabled: () => boolean;
  isVisible: () => boolean;
  show: () => Promise<void>;
  hide: () => void;
  log?: (...args: any[]) => void;
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