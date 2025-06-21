import { TabSnapshot } from '@src/types/messaging';

export interface TabSnapshotOptions {
  maxSnapshotsPerTab: number;
  maxContentLength: number;
}

export class TabSnapshotManager {
  private static instance: TabSnapshotManager;
  private snapshots = new Map<number, TabSnapshot[]>(); // tabId -> snapshots array
  private options: TabSnapshotOptions;
  private debug = false;

  private constructor(options: Partial<TabSnapshotOptions> = {}) {
    this.options = {
      maxSnapshotsPerTab: 5,
      maxContentLength: 1_000_000, // 1MB
      ...options
    };
  }

  static getInstance(options?: Partial<TabSnapshotOptions>): TabSnapshotManager {
    if (!this.instance) {
      this.instance = new TabSnapshotManager(options);
    }
    return this.instance;
  }

  /**
   * Enable or disable verbose debug logging for scraping
   */
  setDebug(enabled: boolean): void {
    this.debug = enabled;
    console.log(`Sol TabSnapshotManager: Debug mode ${enabled ? 'ENABLED' : 'disabled'}`);
  }

  /**
   * Add a new snapshot for a tab
   */
  addSnapshot(snapshot: Omit<TabSnapshot, 'timestamp' | 'version' | 'contentHash' | 'lastAccessed' | 'isCompressed' | 'metadata'>): void {
    const tabId = snapshot.tabId;
    const fullSnapshot: TabSnapshot = {
      ...snapshot,
      timestamp: Date.now(),
      // Add required enhanced fields with defaults
      version: 1,
      contentHash: this.generateSimpleHash(snapshot.content),
      lastAccessed: Date.now(),
      isCompressed: false,
      metadata: {
        domain: this.extractDomain(snapshot.url),
        contentLength: snapshot.content.length
      }
    };

    // Truncate content if too large
    if (fullSnapshot.content.length > this.options.maxContentLength) {
      console.warn(`Sol TabSnapshotManager: Content for tab ${tabId} exceeds max length, truncating`);
      fullSnapshot.content = fullSnapshot.content.substring(0, this.options.maxContentLength) + '\n\n[Content truncated...]';
    }

    if (this.debug) {
      console.log('Sol TabSnapshotManager: Adding snapshot', {
        tabId,
        changeType: snapshot.changeType,
        url: snapshot.url,
        contentLength: snapshot.content.length
      });
    }

    if (!this.snapshots.has(tabId)) {
      this.snapshots.set(tabId, []);
    }

    const tabSnapshots = this.snapshots.get(tabId)!;

    // Handle navigation - clear previous snapshots if URL changed
    const lastSnapshot = tabSnapshots[tabSnapshots.length - 1];
    if (lastSnapshot && lastSnapshot.url !== fullSnapshot.url && fullSnapshot.changeType === 'navigation') {
      console.log(`Sol TabSnapshotManager: Navigation detected for tab ${tabId}, clearing previous snapshots`);
      tabSnapshots.length = 0;
      fullSnapshot.version = 1;
    } else if (lastSnapshot) {
      // Increment version for same URL
      fullSnapshot.version = lastSnapshot.version + 1;
    }

    // Add new snapshot
    tabSnapshots.push(fullSnapshot);

    // Maintain size limit
    if (tabSnapshots.length > this.options.maxSnapshotsPerTab) {
      const removed = tabSnapshots.splice(0, tabSnapshots.length - this.options.maxSnapshotsPerTab);
      console.log(`Sol TabSnapshotManager: Removed ${removed.length} old snapshots for tab ${tabId}`);
    }

    console.log(`Sol TabSnapshotManager: Added snapshot v${fullSnapshot.version} for tab ${tabId} (${tabSnapshots.length}/${this.options.maxSnapshotsPerTab})`);
  }

  /**
   * Get the latest snapshot for a tab
   */
  getLatestSnapshot(tabId: number): TabSnapshot | null {
    const tabSnapshots = this.snapshots.get(tabId);
    if (!tabSnapshots || tabSnapshots.length === 0) {
      if (this.debug) {
        console.warn(`Sol TabSnapshotManager: No snapshot found for tab ${tabId}`);
      }
      return null;
    }

    const latest = tabSnapshots[tabSnapshots.length - 1];
    latest.lastAccessed = Date.now();
    return latest;
  }

  /**
   * Get all snapshots for a tab
   */
  getAllSnapshots(tabId: number): TabSnapshot[] {
    return this.snapshots.get(tabId) || [];
  }

  /**
   * Get latest snapshots for multiple tabs
   */
  getLatestSnapshots(tabIds: number[]): Array<TabSnapshot | null> {
    const results = tabIds.map(tabId => this.getLatestSnapshot(tabId));
    if (this.debug) {
      console.log('Sol TabSnapshotManager: getLatestSnapshots', {
        tabIds,
        found: results.map(s => !!s),
      });
    }
    return results;
  }

  /**
   * Get merged content from all snapshots for a tab (for history context)
   */
  getMergedContent(tabId: number, includeHistory: boolean = false): string {
    const snapshots = this.getAllSnapshots(tabId);
    if (snapshots.length === 0) {
      return '';
    }

    if (!includeHistory) {
      // Just return the latest content
      return snapshots[snapshots.length - 1].content;
    }

    // Merge all snapshots with timestamps and versions
    const mergedParts: string[] = [];
    snapshots.forEach((snapshot, index) => {
      const timestamp = new Date(snapshot.timestamp).toLocaleTimeString();
      const prefix = index === 0 ? '[Initial Load]' : `[Update ${index} v${snapshot.version}]`;
      mergedParts.push(`${prefix} at ${timestamp}:\n${snapshot.content}`);
    });

    return mergedParts.join('\n\n---\n\n');
  }

  /**
   * Clear all snapshots for a tab
   */
  clearTab(tabId: number): void {
    const removed = this.snapshots.delete(tabId);
    if (removed) {
      console.log(`Sol TabSnapshotManager: Cleared all snapshots for tab ${tabId}`);
    }
  }

  /**
   * Clear snapshots for multiple tabs
   */
  clearTabs(tabIds: number[]): void {
    tabIds.forEach(tabId => this.clearTab(tabId));
  }

  /**
   * Get memory usage statistics
   */
  getStats(): {
    totalTabs: number;
    totalSnapshots: number;
    totalContentSize: number;
    avgSnapshotsPerTab: number;
  } {
    let totalSnapshots = 0;
    let totalContentSize = 0;

    this.snapshots.forEach(tabSnapshots => {
      totalSnapshots += tabSnapshots.length;
      tabSnapshots.forEach(snapshot => {
        totalContentSize += snapshot.content.length;
      });
    });

    return {
      totalTabs: this.snapshots.size,
      totalSnapshots,
      totalContentSize,
      avgSnapshotsPerTab: this.snapshots.size > 0 ? totalSnapshots / this.snapshots.size : 0
    };
  }

  /**
   * Update options
   */
  updateOptions(newOptions: Partial<TabSnapshotOptions>): void {
    this.options = { ...this.options, ...newOptions };
    
    // Apply new limits to existing snapshots
    this.snapshots.forEach((tabSnapshots, tabId) => {
      if (tabSnapshots.length > this.options.maxSnapshotsPerTab) {
        const removed = tabSnapshots.splice(0, tabSnapshots.length - this.options.maxSnapshotsPerTab);
        console.log(`Sol TabSnapshotManager: Applied new limit, removed ${removed.length} snapshots for tab ${tabId}`);
      }
    });
  }

  /**
   * Clean up old snapshots (called periodically)
   */
  cleanup(maxAge: number = 24 * 60 * 60 * 1000): void { // 24 hours default
    const cutoff = Date.now() - maxAge;
    let totalRemoved = 0;

    this.snapshots.forEach((tabSnapshots, tabId) => {
      const originalLength = tabSnapshots.length;
      
      // Keep at least the latest snapshot, even if it's old
      if (tabSnapshots.length <= 1) return;

      // Remove old snapshots, but keep the latest one
      const filtered = tabSnapshots.filter((snapshot, index) => 
        index === tabSnapshots.length - 1 || snapshot.timestamp > cutoff
      );

      if (filtered.length !== originalLength) {
        this.snapshots.set(tabId, filtered);
        totalRemoved += originalLength - filtered.length;
      }
    });

    if (totalRemoved > 0) {
      console.log(`Sol TabSnapshotManager: Cleanup removed ${totalRemoved} old snapshots`);
    }
  }

  /**
   * Private helper methods
   */
  private extractDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'unknown';
    }
  }

  private generateSimpleHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }
} 