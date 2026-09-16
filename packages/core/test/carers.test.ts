import { describe, it, expect } from 'vitest';
import { carerNamesOf, carersAfterCollaboratorRemoval, reachWithoutCarers } from '../src/carers';

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

describe('reachWithoutCarers (#1052)', () => {
  const base = {
    createdBy: 'u1',
    addedBy: 'u2',
    coCreators: ['u4', 'u5'],
    founders: ['u6'],
    carers: ['u7', 'u8'],
  };

  it('lists every tie that grants reach except the carer tie', () => {
    expect(reachWithoutCarers(base)).toEqual(['u1', 'u2', 'u4', 'u5', 'u6']);
  });

  it('returns an empty list for a contact with no ties', () => {
    expect(reachWithoutCarers(null)).toEqual([]);
    expect(reachWithoutCarers({})).toEqual([]);
  });
});

describe('carersAfterCollaboratorRemoval (#1052)', () => {
  it('drops a carer whose reach came only from the collaborator tie being removed', () => {
    const contact = {
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u1'],
      carers: ['u3'],
    };
    expect(carersAfterCollaboratorRemoval(contact, 'u3')).toEqual([]);
  });

  it('keeps a founder who has taken the person on — founding is permanent', () => {
    const contact = {
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u3'],
      carers: ['u3'],
    };
    expect(carersAfterCollaboratorRemoval(contact, 'u3')).toEqual(['u3']);
  });

  it('keeps a carer still held by another tie after the collaborator removal', () => {
    const contact = {
      createdBy: 'u3',
      coCreators: ['u2', 'u3'],
      founders: ['u1'],
      carers: ['u3'],
    };
    expect(carersAfterCollaboratorRemoval(contact, 'u3')).toEqual(['u3']);
  });

  it('leaves every other carer untouched', () => {
    const contact = {
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u1'],
      carers: ['u3', 'u4'],
    };
    expect(carersAfterCollaboratorRemoval(contact, 'u3')).toEqual(['u4']);
  });

  it('returns the carers unchanged when the removed uid holds no carer tie', () => {
    const contact = {
      createdBy: 'u1',
      coCreators: ['u2', 'u3'],
      founders: ['u1'],
      carers: ['u4'],
    };
    expect(carersAfterCollaboratorRemoval(contact, 'u3')).toEqual(['u4']);
  });

  it('is empty when nobody holds the person', () => {
    expect(carersAfterCollaboratorRemoval({ createdBy: 'u1', coCreators: ['u2'] }, 'u2')).toEqual([]);
    expect(carersAfterCollaboratorRemoval(undefined, 'u2')).toEqual([]);
  });
});