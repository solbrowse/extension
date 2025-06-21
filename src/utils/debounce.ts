export function debounce<T extends any[]>(fn: (...args: T) => void, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: T): void => {
    if (timer) {
      clearTimeout(timer);
    }
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- Node vs browser typings
    timer = setTimeout(() => fn(...args), wait);
  };
} 