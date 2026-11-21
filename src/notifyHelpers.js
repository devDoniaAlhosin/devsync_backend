/**
 * Unique accepted collaborators for a project update alert.
 * @param {Array<{ data: () => object } | object>} requestDocs
 * @param {string} ownerUid
 * @returns {string[]}
 */
function acceptedCollaboratorIds(requestDocs, ownerUid) {
  const targets = new Set();
  const owner = String(ownerUid || '').trim();
  for (const doc of requestDocs || []) {
    const row = typeof doc?.data === 'function' ? doc.data() : doc || {};
    if (String(row.status || '') !== 'accepted') continue;
    const senderId = String(row.senderId || '').trim();
    if (senderId && senderId !== owner) targets.add(senderId);
  }
  return [...targets];
}

module.exports = { acceptedCollaboratorIds };
