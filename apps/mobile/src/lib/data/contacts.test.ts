// What Contact Detail's edit form actually writes to the contact.
import * as core from '@cisa/core';
import type { Contact, ContactEditFields } from '@cisa/core';
import { updateContact } from './contacts';

jest.mock('@cisa/core', () => ({
  diffContactFields: jest.fn(() => []),
  updateContact: jest.fn(() => Promise.resolve()),
}));
jest.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: jest.fn(),
  logActivity: jest.fn(),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
  sendNotification: jest.fn(),
}));

describe('updateContact', () => {
  const contact = { id: 'c1', name: 'Jordan Lee', metVia: 'Outreach', location: 'Dorm A' } as Contact;
  const base: ContactEditFields = {
    firstName: 'Jordan',
    lastName: 'Lee',
    email: '',
    phone: '',
    stage: '',
    tags: [],
    notes: '',
    spiritualBackground: '',
  };
  const writtenPatch = () => (core.updateContact as jest.Mock).mock.calls[0][2];

  beforeEach(() => jest.clearAllMocks());

  it('writes an edited how-we-met and address', async () => {
    await updateContact(contact, { ...base, metVia: 'Friend', location: 'Dorm B' }, {});
    expect(writtenPatch()).toMatchObject({ metVia: 'Friend', location: 'Dorm B' });
  });

  it('writes a cleared how-we-met and address', async () => {
    await updateContact(contact, { ...base, metVia: '', location: '' }, {});
    expect(writtenPatch()).toMatchObject({ metVia: '', location: '' });
  });

  it('leaves both alone when the edit does not carry them', async () => {
    await updateContact(contact, base, {});
    expect(writtenPatch()).not.toHaveProperty('metVia');
    expect(writtenPatch()).not.toHaveProperty('location');
  });
});
