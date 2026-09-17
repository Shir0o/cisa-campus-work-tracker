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
  filterRole: 'Leader',
  filterSpiritualBackground: 'Christian',
  filterAddedWhen: 'month',
  customRange: { from: '2026-01-01', to: '2026-02-01' },
  selectedTags: ['Freshman', 'Senior'],
} as const;

describe("directoryFilters — retaining People directory filters across contact-detail navigation (#1067)", () => {
  beforeEach(() => {
    __resetDirectoryFilters();
  });

  it("returns the defaults when nothing has been retained yet", () => {
    expect(readDirectoryFilters('u1')).toEqual(DEFAULT_DIRECTORY_FILTERS);
  });

  it("restores exactly what was retained (open-then-close contact detail cycle)", () => {
    writeDirectoryFilters('u1', state as any);
    expect(readDirectoryFilters('u1')).toEqual(state);
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