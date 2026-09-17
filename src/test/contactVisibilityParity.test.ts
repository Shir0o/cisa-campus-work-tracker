// Mirror parity (#1047): the web app's contact-visibility predicates
// (src/lib/permissions.ts, src/lib/contactTies.ts, src/lib/carers.ts) and the
// shared core's (packages/core/src/permissions.ts, .../carers.ts) must give the
// same answer for every reader and every tie shape, or the same person is
// visible on one app and refused on the other — and the Firestore rules, which
// read the access list these derive, side with whichever one wrote last.
//
// #1047 originally proposed deduplicating the two copies by having the web app
// re-export the core one. That is not available here: this web app deliberately
// has no @cisa/core dependency (see the note at the top of src/types.ts), so
// shared logic is mirrored rather than imported. This corpus is the contract
// between the mirrors instead — the same shape as bibleStudyMirrorParity and
// feedVisibleThreadsMirrorParity.
import { describe, it, expect } from 'vitest';
import {
  canSeeContact as webCanSee,
  canManageCollaborators as webCanManage,
  canRemoveContactMember as webCanRemove,
  visibleContacts as webVisibleContacts,
  journeyContacts as webJourneyContacts,
  visibleToOf as webVisibleToOf,
} from '../lib/permissions';
import {
  carerNamesOf as webCarerNames,
  reachWithoutCarers as webReach,
  carersAfterCollaboratorRemoval as webCarersAfter,
} from '../lib/carers';
// Direct relative imports into the workspace package -- resolved for tests only.
import {
  canSeeContact as coreCanSee,
  canManageCollaborators as coreCanManage,
  canRemoveContactMember as coreCanRemove,
  visibleContacts as coreVisibleContacts,
  journeyContacts as coreJourneyContacts,
  visibleToOf as coreVisibleToOf,
} from '../../packages/core/src/permissions';
import {
  carerNamesOf as coreCarerNames,
  reachWithoutCarers as coreReach,
  carersAfterCollaboratorRemoval as coreCarersAfter,
} from '../../packages/core/src/carers';

const ROLES = ['admin', 'manager', 'operator', 'viewer', 'unknown', null] as const;
const READERS = ['creator', 'adder', 'cocreator', 'founder', 'carer', 'stranger', '', null, undefined] as const;

// One contact per tie shape, so every predicate is asked about every way a
// person can (and cannot) be reached.
const CONTACTS: Record<string, Record<string, unknown>> = {
  createdOnly: { createdBy: 'creator' },
  addedOnly: { addedBy: 'adder' },
  coCreated: { createdBy: 'creator', coCreators: ['cocreator'] },
  founded: { createdBy: 'creator', founders: ['creator', 'founder'] },
  cared: { createdBy: 'creator', carers: ['carer'] },
  everything: {
    createdBy: 'creator',
    addedBy: 'adder',
    coCreators: ['cocreator'],
    founders: ['creator', 'founder'],
    carers: ['carer', 'founder'],
  },
  seasoned: { createdBy: 'creator', founders: ['creator', 'founder'], season: 'Fall 2026' },
  tieless: {},
  emptyLists: { createdBy: 'creator', coCreators: [], founders: [], carers: [] },
  dirty: { createdBy: '', addedBy: 'adder', coCreators: ['', 'cocreator', 'cocreator'], founders: [] },
};

const each = (fn: (label: string, contact: Record<string, unknown>) => void) => {
  for (const [label, contact] of Object.entries(CONTACTS)) fn(label, contact);
};

describe('contact visibility: web and core mirrors agree (#1047)', () => {
  it('derives the same access list from every tie shape', () => {
    each((label, contact) => {
      expect(webVisibleToOf(contact), label).toEqual(coreVisibleToOf(contact));
    });
    expect(webVisibleToOf(null)).toEqual(coreVisibleToOf(null));
    expect(webVisibleToOf(undefined)).toEqual(coreVisibleToOf(undefined));
  });

  it('answers "can this reader see this person" identically', () => {
    for (const role of ROLES) {
      for (const reader of READERS) {
        each((label, contact) => {
          const where = `${label} / ${role} / ${reader}`;
          expect(webCanSee(role, reader, contact), where).toBe(coreCanSee(role, reader, contact));
        });
        expect(webCanSee(role, reader, null)).toBe(coreCanSee(role, reader, null));
        expect(webCanSee(role, reader, undefined)).toBe(coreCanSee(role, reader, undefined));
      }
    }
  });

  it('answers "can this reader manage collaborators" identically', () => {
    for (const role of ROLES) {
      for (const reader of READERS) {
        each((label, contact) => {
          const where = `${label} / ${role} / ${reader}`;
          expect(webCanManage(role, reader, contact), where).toBe(coreCanManage(role, reader, contact));
        });
      }
    }
  });

  it('answers "can this reader remove that member" identically', () => {
    for (const role of ROLES) {
      for (const actor of READERS) {
        for (const target of READERS) {
          each((label, contact) => {
            const where = `${label} / ${role} / ${actor} -> ${target}`;
            expect(webCanRemove(role, actor, contact, target), where).toBe(
              coreCanRemove(role, actor, contact, target),
            );
          });
        }
      }
    }
  });

  it('filters a roster identically', () => {
    const list = Object.entries(CONTACTS).map(([id, c]) => ({ id, ...c }));
    for (const role of ROLES) {
      for (const reader of READERS) {
        const where = `${role} / ${reader}`;
        expect(webVisibleContacts(role, reader, list), where).toEqual(
          coreVisibleContacts(role, reader, list),
        );
        expect(webJourneyContacts(role, reader, list, 'Fall 2026'), where).toEqual(
          coreJourneyContacts(role, reader, list, 'Fall 2026'),
        );
        expect(webJourneyContacts(role, reader, list), where).toEqual(
          coreJourneyContacts(role, reader, list),
        );
      }
    }
  });
});

describe('carers: web and core mirrors agree (#1047)', () => {
  const names = { carer: 'Amy Chen', founder: '  ', creator: 'Tony Wang', ghost: undefined };

  it('names the same carers', () => {
    each((label, contact) => {
      const carers = (contact.carers as string[] | undefined) ?? null;
      expect(webCarerNames(carers, names), label).toEqual(coreCarerNames(carers, names));
    });
    expect(webCarerNames(null, names)).toEqual(coreCarerNames(null, names));
    expect(webCarerNames(['carer', 'carer', 'nobody'], null)).toEqual(
      coreCarerNames(['carer', 'carer', 'nobody'], null),
    );
  });

  it('computes the same reach without the carer tie', () => {
    each((label, contact) => {
      expect(webReach(contact), label).toEqual(coreReach(contact));
    });
    expect(webReach(null)).toEqual(coreReach(null));
  });

  it('drops the same carer ties when a collaborator is removed', () => {
    for (const removed of ['cocreator', 'carer', 'founder', 'creator', 'stranger']) {
      each((label, contact) => {
        const where = `${label} / removing ${removed}`;
        expect(webCarersAfter(contact, removed), where).toEqual(coreCarersAfter(contact, removed));
      });
    }
  });
});
