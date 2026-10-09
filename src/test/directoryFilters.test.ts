import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_DIRECTORY_FILTERS,
  readDirectoryFilters,
  writeDirectoryFilters,
  clearDirectoryFilters,
  __resetDirectoryFilters,
} from "../lib/directoryFilters";

const state = {
  searchQuery: 'Alice',
  filterStage: 'Regular',
  filterSpiritualBackground: 'Christian',
  filterInterest: 'Bible study',
  filterAddedWhen: 'month',
  filterHasPhone: true,
  customRange: { from: '2026-01-01', to: '2026-02-01' },
  selectedTags: ['Freshman', 'Senior'],
} as const;

describe("directoryFilters — retaining People directory filters across contact-detail navigation (#1067)", () => {
  beforeEach(() => {
    __resetDirectoryFilters();
  });

  it("returns the defaults when nothing has been retained yet", () => {
    expect(readDirectoryFilters('u1')).toEqual(DEFAULT_DIRECTORY_FILTERS);
    expect(DEFAULT_DIRECTORY_FILTERS.filterInterest).toBe('All');
  });

  it("defaults filterHasPhone to false and round-trips it (#1391)", () => {
    expect(DEFAULT_DIRECTORY_FILTERS.filterHasPhone).toBe(false);
    writeDirectoryFilters('u1', { ...state, filterHasPhone: true } as any);
    expect(readDirectoryFilters('u1').filterHasPhone).toBe(true);
  });

  it("defaults filterHasPhone to false for state saved before the field existed (#1391)", () => {
    const { filterHasPhone: _dropped, ...stale } = state;
    writeDirectoryFilters('u1', stale as any);
    expect(readDirectoryFilters('u1').filterHasPhone).toBe(false);
  });

  it("restores exactly what was retained (open-then-close contact detail cycle)", () => {
    writeDirectoryFilters('u1', state as any);
    expect(readDirectoryFilters('u1')).toEqual(state);
  });

  it("loads retained state that still carries the retired Group value, and drops it (#1345)", () => {
    writeDirectoryFilters('u1', { ...state, filterRole: 'Leader' } as any);
    const read = readDirectoryFilters('u1');
    expect(read).not.toHaveProperty('filterRole');
    expect(read.filterStage).toBe('Regular');
  });

  it("scopes state per user so it does not leak across accounts/roles", () => {
    writeDirectoryFilters('u1', state as any);
    expect(readDirectoryFilters('u2')).toEqual(DEFAULT_DIRECTORY_FILTERS);
  });

  it("returns fresh copies so mutating a read result never corrupts the store or another read", () => {
    writeDirectoryFilters('u1', state as any);
    const a = readDirectoryFilters('u1');
    const b = readDirectoryFilters('u1');
    a.selectedTags.push('Changed');
    a.customRange.from = 'HACKED';
    expect(b.selectedTags).toEqual(state.selectedTags);
    expect(b.customRange.from).toBe('2026-01-01');
    expect(readDirectoryFilters('u1').selectedTags).toEqual(state.selectedTags);
  });

  it("clear forgets the retained state so a fresh visit starts clean", () => {
    writeDirectoryFilters('u1', state as any);
    clearDirectoryFilters('u1');
    expect(readDirectoryFilters('u1')).toEqual(DEFAULT_DIRECTORY_FILTERS);
  });
});