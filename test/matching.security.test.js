const { it } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createMatchingAccess } = require('../src/matching/access');
const { validateMatchRequest } = require('../src/matching/validation');
const { scoreWithGemini } = require('../src/matching/geminiClient');
const { scoreMatches } = require('../src/matching/scoring');
const profile = { uid: 'u', declaredSkills: ['JS'], githubLanguages: {},
  publicRepoCount: 0, totalContributions: 0, topRepositories: [] };
const project = { projectId: 'p', projectName: 'Project', description: '',
  githubUrl: '', neededSkills: ['JavaScript'], maintainerId: 'other' };
function response() {
  const res = new EventEmitter();
  res.status = code => { res.code = code; return res; };
  res.json = data => { res.body = data; return res; };
  res.set = () => res;
  return res;
}
it('requires authentication and verifies ownership before scoring', async () => {
  const gate = createMatchingAccess({ admin: () => ({ auth: () => ({
    verifyIdToken: async token => { if (token === 'bad') throw Error(); return { uid: 'u' }; },
  }) }) });
  for (const [token, uid, status] of [['', 'u', 401], ['bad', 'u', 401], ['ok', 'other', 403]]) {
    const res = response();
    await gate({ headers: { authorization: token && `Bearer ${token}` }, body: { uid } }, res,
      () => assert.fail('unauthorized'));
    assert.equal(res.code, status);
  }
});
it('limits authenticated bursts and releases concurrent slots on disconnect', async () => {
  const gate = createMatchingAccess({ admin: () => ({ auth: () => ({
    verifyIdToken: async () => ({ uid: 'u' }),
  }) }) });
  for (let i = 0; i < 7; i++) {
    const res = response(); let allowed = false;
    await gate({ headers: { authorization: 'Bearer ok' }, body: { uid: 'u' } }, res,
      () => { allowed = true; res.emit('close'); });
    assert.equal(allowed, i < 6);
    if (i === 6) assert.equal(res.code, 429);
  }
});
it('validates candidate bounds, duplicate IDs and preferences', () => {
  assert.equal(validateMatchRequest({ ...profile, projects: [project] }).ok, true);
  for (const fields of [{ projects: [project, project] }, { projects: Array(21).fill(project) },
    { projects: [{ ...project, neededSkills: [2] }] }, { prompt: 'a'.repeat(1001) }]) {
    assert.equal(validateMatchRequest({ ...profile, ...fields }).ok, false);
  }
});
it('empty declared skills never invent matches from GitHub languages', () => {
  assert.deepEqual(scoreMatches({ ...profile, declaredSkills: [], githubLanguages: { JavaScript: 10 } }, [project]), []);
});
it('Gemini adapter sends structured output and fills omitted candidates using fallback', async () => {
  const second = { ...project, projectId: 'p2', neededSkills: ['Python'] };
  const client = { modelName: 'test', model: { generateContent: async request => {
    assert.equal(request.generationConfig.responseSchema.type, 'array');
    return { response: { text: () => JSON.stringify([{ projectId: 'p', score: 91, reason: 'JS matches JavaScript.' }]) } };
  } } };
  const result = await scoreWithGemini(profile, [project, second], client);
  assert.equal(result.matches.length, 2);
  assert.equal(result.matches[0].isFallback, false);
  assert.equal(result.matches[1].isFallback, true);
});
it('Gemini malformed JSON, upstream errors and timeouts select deterministic fallback', async () => {
  for (const error of [new Error('timeout'), Object.assign(new Error(), { statusCode: 429 })]) {
    assert.equal(await scoreWithGemini(profile, [project], { modelName: 'test', model: {
      generateContent: async () => { throw error; },
    } }), null);
  }
  assert.equal(await scoreWithGemini(profile, [project], { modelName: 'test', model: {
    generateContent: async () => ({ response: { text: () => 'invalid' } }),
  } }), null);
});
