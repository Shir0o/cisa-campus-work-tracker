import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_DIRECTORY_FILTERS,
  NOT_YET_PLACED,
  readDirectoryFilters,
  writeDirectoryFilters,
  clearDirectoryFilters,
  filterByStage,
  isNotYetPlaced,
  sortDirectoryContacts,
  __resetDirectoryFilters,
  type DirectorySort,
} from "../lib/directoryFilters";

const state = {
  searchQuery: 'Alice',
  filterStage: 'Regular',
  selectedTags: ['Freshman', 'Senior'],
  sort: 'longest',
} as const;

describe("directoryFilters — retaining People directory filters across contact-detail navigation (#1067)", () => {
  beforeEach(() => {
    __resetDirectoryFilters();
  });

  it("returns the defaults when nothing has been retained yet", () => {
    expect(readDirectoryFilters('u1')).toEqual(DEFAULT_DIRECTORY_FILTERS);
    expect(DEFAULT_DIRECTORY_FILTERS.filterStage).toBe('All');
  });

  it("drops the filter fields that were cut, so an old memory cannot bring them back (§23)", () => {
    writeDirectoryFilters('u1', {
      ...state,
      filterSpiritualBackground: 'Christian',
      filterInterest: 'Bible study',
      filterHasPhone: true,
      filterAddedWhen: 'month',
      customRange: { from: '2026-01-01', to: '2026-02-01' },
    } as any);
    const read = readDirectoryFilters('u1') as unknown as Record<string, unknown>;
    for (const key of [
      'filterSpiritualBackground',
      'filterInterest',
      'filterHasPhone',
      'filterAddedWhen',
      'customRange',
    ]) {
      expect(read, key).not.toHaveProperty(key);
    }
    expect(read.filterStage).toBe('Regular');
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
    expect(b.selectedTags).toEqual(state.selectedTags);
    expect(readDirectoryFilters('u1').selectedTags).toEqual(state.selectedTags);
  });

  it("clear forgets the retained state so a fresh visit starts clean", () => {
    writeDirectoryFilters('u1', state as any);
    clearDirectoryFilters('u1');
    expect(readDirectoryFilters('u1')).toEqual(DEFAULT_DIRECTORY_FILTERS);
  });
});

describe("directoryFilters — the chosen order is remembered too (#1783)", () => {
  beforeEach(() => {
    __resetDirectoryFilters();
  });

  it("opens on Name, the list's existing order", () => {
    expect(DEFAULT_DIRECTORY_FILTERS.sort).toBe('name');
    expect(readDirectoryFilters('u1').sort).toBe('name');
  });

  it("round-trips a chosen order", () => {
    writeDirectoryFilters('u1', { ...DEFAULT_DIRECTORY_FILTERS, sort: 'longest' });
    expect(readDirectoryFilters('u1').sort).toBe('longest');
  });

  it("reads state saved before the field existed as Name", () => {
    const { sort: _dropped, ...stale } = { ...DEFAULT_DIRECTORY_FILTERS, sort: 'longest' as DirectorySort };
    writeDirectoryFilters('u1', stale as any);
    expect(readDirectoryFilters('u1').sort).toBe('name');
  });

  it("clear resets the order along with the filters", () => {
    writeDirectoryFilters('u1', { ...DEFAULT_DIRECTORY_FILTERS, sort: 'added' });
    clearDirectoryFilters('u1');
    expect(readDirectoryFilters('u1').sort).toBe('name');
  });
});

// The four stated orders (#1783). Expected values are written out by hand:
// each list is named for the person it should surface first.
describe("sortDirectoryContacts — Recently connected, Longest since connected, Recently added, Name", () => {
  const contacts = [
    { id: 'ada', name: 'Ada', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'bo', name: 'Bo', createdAt: '2026-03-01T00:00:00.000Z' },
    { id: 'cy', name: 'Cy', createdAt: '2026-02-01T00:00:00.000Z' },
    { id: 'dee', name: 'Dee', createdAt: undefined },
  ];
  // Bo has never been connected with; the rest were, at these times.
  const DAY = 86_400_000;
  const now = Date.parse('2026-06-01T00:00:00.000Z');
  const touchMs = (id: string): number | null =>
    id === 'ada' ? now - 10 * DAY : id === 'cy' ? now - 2 * DAY : id === 'dee' ? now - 30 * DAY : null;

  const ids = (sort: DirectorySort) => sortDirectoryContacts(contacts, sort, touchMs).map((c) => c.id);

  it("Recently connected puts the most recent first and anyone never reached last", () => {
    expect(ids('recent')).toEqual(['cy', 'ada', 'dee', 'bo']);
  });

  it("Longest since connected puts the longest wait first and anyone never reached at the top", () => {
    expect(ids('longest')).toEqual(['bo', 'dee', 'ada', 'cy']);
  });

  it("Recently added puts the newest person first and one with no date last", () => {
    expect(ids('added')).toEqual(['bo', 'cy', 'ada', 'dee']);
  });

  it("Name is alphabetical", () => {
    expect(ids('name')).toEqual(['ada', 'bo', 'cy', 'dee']);
  });

  it("breaks ties by name so the same list always comes back in the same order", () => {
    const tied = [
      { id: 'z', name: 'Zoe', createdAt: '2026-05-01T00:00:00.000Z' },
      { id: 'a', name: 'Abe', createdAt: '2026-05-01T00:00:00.000Z' },
    ];
    expect(sortDirectoryContacts(tied, 'added', () => null).map((c) => c.name)).toEqual(['Abe', 'Zoe']);
    expect(sortDirectoryContacts(tied, 'longest', () => null).map((c) => c.name)).toEqual(['Abe', 'Zoe']);
  });

  it("leaves the caller's list untouched", () => {
    const original = contacts.map((c) => c.id);
    sortDirectoryContacts(contacts, 'added', touchMs);
    expect(contacts.map((c) => c.id)).toEqual(original);
  });

  it("reads a legacy Timestamp createdAt as a date rather than as missing", () => {
    const legacy = [
      { id: 'seconds', name: 'Seconds', createdAt: { seconds: 1_700_000_000 } },
      { id: 'todate', name: 'ToDate', createdAt: { toDate: () => new Date('2026-05-01T00:00:00.000Z') } },
      { id: 'none', name: 'None', createdAt: undefined },
    ];
    expect(sortDirectoryContacts(legacy, 'added', () => null).map((c) => c.id)).toEqual(['todate', 'seconds', 'none']);
  });
});
// The Step filter (§22): the Journey board is gone, so its "not yet placed"
// column becomes an option in People's own Step filter.
describe("filterByStage — the Step filter, with Not yet placed (§22)", () => {
  const stages = ['First Contact', 'Regular'];
  const people = [
    { id: 'placed', stage: 'Regular' },
    { id: 'other-step', stage: 'First Contact' },
    { id: 'missing', stage: undefined },
    { id: 'blank', stage: '' },
    { id: 'null', stage: null },
    { id: 'retired-step', stage: 'Church Home' },
  ];
  const ids = (filter: string) => filterByStage(people, filter, stages).map((p) => p.id);

  it("All keeps everyone", () => {
    expect(ids('All')).toEqual(people.map((p) => p.id));
  });

  it("a named step keeps only the people on it", () => {
    expect(ids('Regular')).toEqual(['placed']);
    expect(ids('First Contact')).toEqual(['other-step']);
  });

  it("Not yet placed keeps a missing, blank or retired step — anyone with no step that exists", () => {
    expect(ids(NOT_YET_PLACED)).toEqual(['missing', 'blank', 'null', 'retired-step']);
  });

  it("Not yet placed is a distinct filter value, never a step's label", () => {
    expect(stages).not.toContain(NOT_YET_PLACED);
  });

  it("isNotYetPlaced reads one person the same way", () => {
    expect(isNotYetPlaced({ stage: 'Regular' }, stages)).toBe(false);
    expect(isNotYetPlaced({ stage: 'Gone' }, stages)).toBe(true);
    expect(isNotYetPlaced({}, stages)).toBe(true);
  });

  it("leaves the caller's list untouched", () => {
    filterByStage(people, NOT_YET_PLACED, stages);
    expect(people.map((p) => p.id)).toEqual(['placed', 'other-step', 'missing', 'blank', 'null', 'retired-step']);
  });
});
