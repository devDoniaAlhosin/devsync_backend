const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { acceptedCollaboratorIds } = require('../src/notifyHelpers');

describe('acceptedCollaboratorIds', () => {
  it('keeps unique accepted senders and skips owner / pending', () => {
    const docs = [
      { data: () => ({ status: 'accepted', senderId: 'a' }) },
      { data: () => ({ status: 'pending', senderId: 'b' }) },
      { data: () => ({ status: 'accepted', senderId: 'a' }) },
      { data: () => ({ status: 'accepted', senderId: 'owner-1' }) },
      { data: () => ({ status: 'accepted', senderId: 'c' }) },
    ];
    assert.deepEqual(acceptedCollaboratorIds(docs, 'owner-1').sort(), ['a', 'c']);
  });

  it('returns empty when nothing accepted', () => {
    assert.deepEqual(
      acceptedCollaboratorIds([{ status: 'declined', senderId: 'a' }], 'owner'),
      [],
    );
  });
});
