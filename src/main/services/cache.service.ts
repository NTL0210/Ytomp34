import { join } from 'path';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { logger } from './logger.service';
import { directoryManager } from './directory-manager.service';

/**
 * Cache Service with LRU (Least Recently Used) eviction
 * Caches URL validation results and metadata
 * Requirements: REQ-FUN-002.1, REQ-FUN-002.2, REQ-FUN-002.3, 
 *               REQ-FUN-002.4, REQ-FUN-002.5, REQ-FUN-002.6
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheData {
  [key: string]: CacheEntry<any>;
}

class CacheService {
  private cache: Map<string, CacheEntry<any>>;
  private readonly MAX_ENTRIES = 1000;
  private readonly CACHE_FILE = 'url-cache.json';
  private cacheFilePath: string = '';
  private initialized: boolean = false;

  constructor() {
    this.cache = new Map();
  }

  /**
   * Initialize cache service
   * Loads cache from disk if exists
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      const cacheDir = await directoryManager.getDirectory('cache');
      this.cacheFilePath = join(cacheDir, this.CACHE_FILE);

      // Load cache from disk
      await this.load();

      this.initialized = true;
      logger.info('Cache', 'Cache service initialized', {
        entries: this.cache.size,
        filePath: this.cacheFilePath,
      });
    } catch (error) {
      logger.error('Cache', 'Failed to initialize cache service', { error });
      // Continue with empty cache
      this.initialized = true;
    }
  }

  /**
   * Get value from cache
   * Returns null if not found or expired
   * Must complete in < 10ms (REQ-FUN-002.2)
   */
  public async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();

    if (!this.initialized) {
      await this.initialize();
    }

    const entry = this.cache.get(key);

    if (!entry) {
      logger.debug('Cache', 'Cache miss', { key });
      return null;
    }

    // Update access metadata (LRU)
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    this.cache.set(key, entry);

    const duration = Date.now() - startTime;
    if (duration > 10) {
      logger.warning('Cache', 'Cache lookup exceeded 10ms threshold', {
        key,
        duration,
      });
    }

    logger.debug('Cache', 'Cache hit', { key, duration });
    return entry.value as T;
  }

  /**
   * Set value in cache
   * Triggers LRU eviction if cache is full
   */
  public async set<T>(key: string, value: T): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    // Check if cache is full
    if (this.cache.size >= this.MAX_ENTRIES && !this.cache.has(key)) {
      await this.evictLRU();
    }

    const entry: CacheEntry<T> = {
      value,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    logger.debug('Cache', 'Cache set', { key, size: this.cache.size });

    // Async save to disk (don't wait)
    this.save().catch((error) => {
      logger.error('Cache', 'Failed to save cache to disk', { error });
    });
  }

  /**
   * Check if key exists in cache
   */
  public async has(key: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    return this.cache.has(key);
  }

  /**
   * Clear all cache entries
   */
  public async clear(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    this.cache.clear();
    logger.info('Cache', 'Cache cleared');

    // Delete cache file
    try {
      if (existsSync(this.cacheFilePath)) {
        await fs.unlink(this.cacheFilePath);
      }
    } catch (error) {
      logger.error('Cache', 'Failed to delete cache file', { error });
    }
  }

  /**
   * Delete specific cache entry
   */
  public async delete(key: string): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize();
    }

    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug('Cache', 'Cache entry deleted', { key });
      
      // Async save to disk
      this.save().catch((error) => {
        logger.error('Cache', 'Failed to save cache after deletion', { error });
      });
    }

    return deleted;
  }

  /**
   * Evict least recently used entry
   * Called when cache reaches MAX_ENTRIES
   */
  private async evictLRU(): Promise<void> {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    // Find least recently used entry
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug('Cache', 'LRU eviction', {
        key: oldestKey,
        age: Date.now() - oldestTime,
      });
    }
  }

  /**
   * Load cache from disk
   */
  private async load(): Promise<void> {
    try {
      if (!existsSync(this.cacheFilePath)) {
        logger.debug('Cache', 'No cache file found, starting with empty cache');
        return;
      }

      const data = await fs.readFile(this.cacheFilePath, 'utf8');
      const cacheData: CacheData = JSON.parse(data);

      // Restore cache entries
      for (const [key, entry] of Object.entries(cacheData)) {
        this.cache.set(key, entry);
      }

      logger.info('Cache', 'Cache loaded from disk', {
        entries: this.cache.size,
      });
    } catch (error) {
      logger.error('Cache', 'Failed to load cache from disk', { error });
      // Start with empty cache on error
      this.cache.clear();
    }
  }

  /**
   * Save cache to disk
   * Async operation, doesn't block
   */
  private async save(): Promise<void> {
    try {
      // Convert Map to plain object for JSON serialization
      const cacheData: CacheData = {};
      for (const [key, entry] of this.cache.entries()) {
        cacheData[key] = entry;
      }

      const json = JSON.stringify(cacheData, null, 2);
      await fs.writeFile(this.cacheFilePath, json, 'utf8');

      logger.debug('Cache', 'Cache saved to disk', {
        entries: this.cache.size,
      });
    } catch (error) {
      logger.error('Cache', 'Failed to save cache to disk', { error });
    }
  }

  /**
   * Get cache statistics
   */
  public async getStats(): Promise<{
    size: number;
    maxSize: number;
    hitRate: number;
  }> {
    if (!this.initialized) {
      await this.initialize();
    }

    let totalAccesses = 0;
    for (const entry of this.cache.values()) {
      totalAccesses += entry.accessCount;
    }

    return {
      size: this.cache.size,
      maxSize: this.MAX_ENTRIES,
      hitRate: totalAccesses > 0 ? this.cache.size / totalAccesses : 0,
    };
  }

  /**
   * Get cache size
   */
  public getSize(): number {
    return this.cache.size;
  }

  /**
   * Force save cache to disk
   * Should be called before app quit
   */
  public async flush(): Promise<void> {
    await this.save();
  }
}

// Export singleton instance
export const cacheService = new CacheService();
