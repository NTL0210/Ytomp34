import {
  mapWithConcurrency,
  MAX_BATCH_URLS,
  parseBatchUrls
} from '../../renderer/src/utils/batch';

describe('batch URL utilities', () => {
  it('parses HTTP URLs, removes duplicates, and reports invalid entries', () => {
    const parsed = parseBatchUrls([
      'https://example.com/one',
      'https://example.com/one',
      'http://example.com/two',
      'file:///not-allowed',
      'not-a-url'
    ].join('\n'));

    expect(parsed.urls).toEqual([
      'https://example.com/one',
      'http://example.com/two'
    ]);
    expect(parsed.duplicateCount).toBe(1);
    expect(parsed.invalidEntries).toEqual(['file:///not-allowed', 'not-a-url']);
  });

  it('reports batches larger than the supported limit', () => {
    const input = Array.from(
      { length: MAX_BATCH_URLS + 1 },
      (_, index) => `https://example.com/${index}`
    ).join('\n');

    expect(parseBatchUrls(input).exceedsLimit).toBe(true);
  });

  it('preserves result order and respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;

    const results = await mapWithConcurrency([30, 5, 20, 1], 2, async value => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, value));
      active -= 1;
      return value * 2;
    });

    expect(results).toEqual([60, 10, 40, 2]);
    expect(peak).toBe(2);
  });
});
