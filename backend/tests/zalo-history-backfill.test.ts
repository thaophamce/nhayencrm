import { describe, expect, it } from 'vitest';
import { groupIdsFromCatalog } from '../src/modules/zalo/zalo-history-backfill.js';

describe('groupIdsFromCatalog', () => {
  it('reads complete IDs from gridVerMap when gridInfoMap is empty', () => {
    expect(groupIdsFromCatalog({
      gridVerMap: { g1: '1', g2: '2' },
      gridInfoMap: {},
    })).toEqual(['g1', 'g2']);
  });

  it('deduplicates IDs present in both maps', () => {
    expect(groupIdsFromCatalog({
      gridVerMap: { g1: '1', g2: '2' },
      gridInfoMap: { g2: { name: 'Two' }, g3: { name: 'Three' } },
    })).toEqual(['g1', 'g2', 'g3']);
  });

  it('returns an empty list for invalid payloads', () => {
    expect(groupIdsFromCatalog(null)).toEqual([]);
    expect(groupIdsFromCatalog([])).toEqual([]);
  });
});
