import browser from 'webextension-polyfill';

/**
 * Lightweight logger that suppresses most Sol-specific console.log output
 * unless the user has enabled the global `debug` flag in storage (or the
 * legacy `debugScraping` flag).
 *
 * It monkey-patches `console.log` (leaving warn/error untouched) and only
 * filters calls whose first argument is a string starting with the prefix
 * "Sol ". That way, logs originating from other libraries or the host page
 * are left intact.
 */
class SolLogger {
  private enabled = false;
  private readonly PREFIX = 'Sol ';
  private originalLog = console.log.bind(console);

  constructor() {
    this.init();
  }

  /**
   * Initialise by reading storage and wiring change listeners.
   */
  private async init() {
    const { debug, debugScraping } = await browser.storage.local.get([
      'debug',
      'debugScraping',
    ]);
    this.enabled = !!debug || !!debugScraping;

    // Patch console.log once.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    console.log = function patchedLog(...args: any[]) {
      if (!self.enabled && typeof args[0] === 'string' && args[0].startsWith(self.PREFIX)) {
        return;
      }
      self.originalLog(...args);
    } as typeof console.log;

    // React to storage updates
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes.debug) {
        this.enabled = !!changes.debug.newValue;
      }
      if (changes.debugScraping) {
        // Legacy flag support; if new debug exists it takes precedence
        if (!('debug' in changes)) {
          this.enabled = !!changes.debugScraping.newValue;
        }
      }
    });
  }
}

// Create singleton immediately so side-effect happens on first import
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _solLoggerSingleton = new SolLogger();

export {}; 