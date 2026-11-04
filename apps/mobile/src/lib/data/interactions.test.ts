// Logging an Interaction on a teammate's behalf (#1288): the Full-timer's
// reacher goes through to core, and the teammate hears about it.
import * as core from '@cisa/core';
import { sendNotification } from '../firebase';
import { addInteraction } from './interactions';

jest.mock('@cisa/core', () => ({
  addInteraction: jest.fn().mockResolvedValue(undefined),
  interactionActivityType: () => 'interaction',
}));
jest.mock('../firebase', () => ({
  db: {},
  handleFirestoreError: jest.fn(),
  logActivity: jest.fn(),
  OperationType: { CREATE: 'CREATE' },
  sendNotification: jest.fn(),
}));

const input = { content: 'Saw her', dateTime: '2026-11-04T10:00:00.000Z', type: 'interaction' };
const by = { uid: 'ft1', name: 'Jae' };

beforeEach(() => jest.clearAllMocks());

describe('addInteraction', () => {
  it('passes the reacher to core and tells them it was logged for them', async () => {
    await addInteraction('c1', 'Priya', input, by, { uid: 'tr1', name: 'Zion' });

    expect(core.addInteraction).toHaveBeenCalledWith({}, 'c1', input, by, { uid: 'tr1', name: 'Zion' });
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'tr1', targetId: 'c1', message: 'Jae logged an interaction with Priya.' }),
    );
  });

  it('is unchanged without a reacher: no one else is told', async () => {
    await addInteraction('c1', 'Priya', input, by);

    expect(core.addInteraction).toHaveBeenCalledWith({}, 'c1', input, by, undefined);
    expect(sendNotification).not.toHaveBeenCalled();
  });
});
