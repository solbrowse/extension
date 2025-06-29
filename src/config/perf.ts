// Performance budgets for Sol extension
export const PERF_BUDGETS = {
  // Main thread budget per frame (Chrome extension context)
  FRAME_BUDGET_MS: 8,
  
  // Peak JS heap size limit (Chrome kills extensions at ~50MB)
  MAX_HEAP_MB: 25,
  
  // Target scroll performance
  TARGET_FPS: 60,
  MAX_MESSAGES_FOR_60FPS: 5000,
  
  // Streaming throttle
  STREAMING_THROTTLE_MS: 50,
  
  // Memory monitoring
  MEMORY_CHECK_INTERVAL_MS: 30000,
  
  // Performance marks
  MARKS: {
    MESSAGE_RENDER_START: 'sol:message-render-start',
    MESSAGE_RENDER_END: 'sol:message-render-end',
    STREAM_DELTA_START: 'sol:stream-delta-start',
    STREAM_DELTA_END: 'sol:stream-delta-end',
    DB_OPERATION_START: 'sol:db-operation-start',
    DB_OPERATION_END: 'sol:db-operation-end'
  }
} as const;

// Performance monitoring utilities
export class PerfMonitor {
  private static instance: PerfMonitor;
  private memoryCheckInterval: number | null = null;

  static getInstance(): PerfMonitor {
    if (!this.instance) {
      this.instance = new PerfMonitor();
    }
    return this.instance;
  }

  startMemoryMonitoring(debugMode: boolean = false): void {
    if (!debugMode || this.memoryCheckInterval) return;

    this.memoryCheckInterval = window.setInterval(() => {
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        const usedMB = memory.usedJSHeapSize / (1024 * 1024);
        
        if (usedMB > PERF_BUDGETS.MAX_HEAP_MB * 0.8) {
          console.warn(`Sol Perf: High memory usage: ${usedMB.toFixed(1)}MB (limit: ${PERF_BUDGETS.MAX_HEAP_MB}MB)`);
        }
        
        if (debugMode) {
          console.log(`Sol Perf: Memory usage: ${usedMB.toFixed(1)}MB`);
        }
      }
    }, PERF_BUDGETS.MEMORY_CHECK_INTERVAL_MS);
  }

  stopMemoryMonitoring(): void {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  markStart(name: string): void {
    performance.mark(`${name}-start`);
  }

  markEnd(name: string): number {
    const endMark = `${name}-end`;
    performance.mark(endMark);
    
    try {
      performance.measure(name, `${name}-start`, endMark);
      const measure = performance.getEntriesByName(name, 'measure')[0];
      return measure.duration;
    } catch (error) {
      console.warn('Sol Perf: Failed to measure performance:', error);
      return 0;
    }
  }

  measureTokensPerSecond(startTime: number, tokenCount: number): number {
    const duration = (Date.now() - startTime) / 1000;
    return tokenCount / duration;
  }
}

export default PerfMonitor.getInstance(); 