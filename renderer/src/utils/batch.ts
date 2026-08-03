export const MAX_BATCH_URLS = 20;
export const BATCH_METADATA_CONCURRENCY = 3;

export interface ParsedBatchUrls {
  urls: string[];
  invalidEntries: string[];
  duplicateCount: number;
  exceedsLimit: boolean;
}

/**
 * Parse one URL per line, remove duplicates, and only accept HTTP(S) sources.
 */
export function parseBatchUrls(input: string): ParsedBatchUrls {
  const entries = input
    .split(/\r?\n/)
    .map(entry => entry.trim())
    .filter(Boolean);
  const uniqueEntries = Array.from(new Set(entries));
  const urls: string[] = [];
  const invalidEntries: string[] = [];

  for (const entry of uniqueEntries) {
    try {
      const parsed = new URL(entry);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        invalidEntries.push(entry);
      } else {
        urls.push(entry);
      }
    } catch {
      invalidEntries.push(entry);
    }
  }

  return {
    urls,
    invalidEntries,
    duplicateCount: entries.length - uniqueEntries.length,
    exceedsLimit: urls.length > MAX_BATCH_URLS
  };
}

/**
 * Map items with bounded concurrency while preserving input order.
 */
export async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  if (items.length === 0) return [];

  const workerCount = Math.max(1, Math.min(Math.floor(concurrency), items.length));
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
