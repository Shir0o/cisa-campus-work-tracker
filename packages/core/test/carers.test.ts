import { describe, it, expect } from 'vitest';
import { carerNamesOf } from '../src/carers';

describe('carerNamesOf (#1051)', () => {
  it('resolves carer uids to display names', () => {
    expect(carerNamesOf(['u1', 'u2'], { u1: 'Ana', u2: 'Ben' })).toEqual(['Ana', 'Ben']);
  });

  it('shows several carers, in the order held on the contact', () => {
    expect(carerNamesOf(['u2', 'u1'], { u1: 'Ana', u2: 'Ben' })).toEqual(['Ben', 'Ana']);
  });

  it('drops carers whose name cannot be resolved rather than inventing one', () => {
    expect(carerNamesOf(['u1', 'u2'], { u1: 'Ana' })).toEqual(['Ana']);
  });

  it('is empty when nobody holds the person', () => {
    expect(carerNamesOf([], { u1: 'Ana' })).toEqual([]);
    expect(carerNamesOf(undefined, { u1: 'Ana' })).toEqual([]);
    expect(carerNamesOf(null, { u1: 'Ana' })).toEqual([]);
  });

  it('de-duplicates repeated names', () => {
    expect(carerNamesOf(['u1', 'u1'], { u1: 'Ana' })).toEqual(['Ana']);
  });
});