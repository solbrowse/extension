export interface ParsedKeybind {
  key: string | undefined;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export function parseKeybind(keybindString: string): ParsedKeybind {
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

export function matchesKeybind(event: KeyboardEvent, keybind: ParsedKeybind): boolean {
  return (
    event.key.toLowerCase() === keybind.key &&
    event.metaKey === keybind.metaKey &&
    event.ctrlKey === keybind.ctrlKey &&
    event.altKey === keybind.altKey &&
    event.shiftKey === keybind.shiftKey
  );
} 