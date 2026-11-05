const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  validateMatchRequest,
  normalizeSkill,
  getSkillCanonical,
  skillsMatch,
  MAX_SKILLS,
  MAX_BIO_LENGTH,
} = require('../src/matching/validation');

describe('validateMatchRequest', () => {
  const validRequest = {
    uid: 'test-user-123',
    declaredSkills: ['JavaScript', 'Python', 'React'],
    githubLanguages: { JavaScript: 5000, Python: 3000 },
    publicRepoCount: 10,
    totalContributions: 500,
    bio: 'Software engineer',
    topRepositories: ['user/repo1', 'user/repo2'],
  };

  it('accepts a valid request', () => {
    const result = validateMatchRequest(validRequest);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.uid, 'test-user-123');
    assert.strictEqual(result.data.declaredSkills.length, 3);
  });

  it('rejects non-object body', () => {
    const result = validateMatchRequest(null);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /JSON object/);
  });

  it('rejects missing uid', () => {
    const { uid, ...rest } = validRequest;
    const result = validateMatchRequest(rest);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /uid/i);
  });

  it('rejects empty uid', () => {
    const result = validateMatchRequest({ ...validRequest, uid: '  ' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /uid/i);
  });

  it('rejects non-string uid', () => {
    const result = validateMatchRequest({ ...validRequest, uid: 123 });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /uid/i);
  });

  it('rejects missing declaredSkills', () => {
    const { declaredSkills, ...rest } = validRequest;
    const result = validateMatchRequest(rest);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /declaredSkills/i);
  });

  it('rejects non-array declaredSkills', () => {
    const result = validateMatchRequest({ ...validRequest, declaredSkills: 'JavaScript' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /array/i);
  });

  it('accepts empty declaredSkills array', () => {
    const result = validateMatchRequest({ ...validRequest, declaredSkills: [] });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.declaredSkills.length, 0);
  });

  it('rejects declaredSkills with non-string elements', () => {
    const result = validateMatchRequest({
      ...validRequest,
      declaredSkills: ['JavaScript', 123, 'Python'],
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /strings/i);
  });

  it('filters out empty skills after normalization', () => {
    const result = validateMatchRequest({
      ...validRequest,
      declaredSkills: ['JavaScript', '  ', 'Python', ''],
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.declaredSkills.length, 2);
  });

  it('rejects too many skills', () => {
    const tooMany = Array(MAX_SKILLS + 1).fill('JavaScript');
    const result = validateMatchRequest({
      ...validRequest,
      declaredSkills: tooMany,
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /many skills/i);
  });

  it('rejects missing githubLanguages', () => {
    const { githubLanguages, ...rest } = validRequest;
    const result = validateMatchRequest(rest);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /githubLanguages/i);
  });

  it('rejects null githubLanguages', () => {
    const result = validateMatchRequest({ ...validRequest, githubLanguages: null });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /githubLanguages/i);
  });

  it('rejects array githubLanguages', () => {
    const result = validateMatchRequest({ ...validRequest, githubLanguages: [] });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /object.*not.*array/i);
  });

  it('accepts empty githubLanguages object', () => {
    const result = validateMatchRequest({ ...validRequest, githubLanguages: {} });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(result.data.githubLanguages, {});
  });

  it('rejects githubLanguages with non-number values', () => {
    const result = validateMatchRequest({
      ...validRequest,
      githubLanguages: { JavaScript: '5000' },
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /number/i);
  });

  it('rejects githubLanguages with negative values', () => {
    const result = validateMatchRequest({
      ...validRequest,
      githubLanguages: { JavaScript: -100 },
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /negative/i);
  });

  it('rejects githubLanguages with NaN', () => {
    const result = validateMatchRequest({
      ...validRequest,
      githubLanguages: { JavaScript: NaN },
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /number/i);
  });

  it('floors githubLanguages values to integers', () => {
    const result = validateMatchRequest({
      ...validRequest,
      githubLanguages: { JavaScript: 5000.7 },
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.githubLanguages.JavaScript, 5000);
  });

  it('rejects missing publicRepoCount', () => {
    const { publicRepoCount, ...rest } = validRequest;
    const result = validateMatchRequest(rest);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /publicRepoCount/i);
  });

  it('rejects non-number publicRepoCount', () => {
    const result = validateMatchRequest({ ...validRequest, publicRepoCount: '10' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /publicRepoCount.*number/i);
  });

  it('rejects negative publicRepoCount', () => {
    const result = validateMatchRequest({ ...validRequest, publicRepoCount: -5 });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /negative/i);
  });

  it('accepts zero publicRepoCount', () => {
    const result = validateMatchRequest({ ...validRequest, publicRepoCount: 0 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.publicRepoCount, 0);
  });

  it('rejects missing totalContributions', () => {
    const { totalContributions, ...rest } = validRequest;
    const result = validateMatchRequest(rest);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /totalContributions/i);
  });

  it('rejects non-number totalContributions', () => {
    const result = validateMatchRequest({ ...validRequest, totalContributions: '500' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /totalContributions.*number/i);
  });

  it('rejects negative totalContributions', () => {
    const result = validateMatchRequest({ ...validRequest, totalContributions: -100 });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /negative/i);
  });

  it('accepts missing bio (optional field)', () => {
    const { bio, ...rest } = validRequest;
    const result = validateMatchRequest(rest);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.bio, null);
  });

  it('accepts null bio', () => {
    const result = validateMatchRequest({ ...validRequest, bio: null });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.bio, null);
  });

  it('converts empty bio to null', () => {
    const result = validateMatchRequest({ ...validRequest, bio: '  ' });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.bio, null);
  });

  it('rejects non-string bio', () => {
    const result = validateMatchRequest({ ...validRequest, bio: 123 });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /bio.*string/i);
  });

  it('rejects too long bio', () => {
    const longBio = 'x'.repeat(MAX_BIO_LENGTH + 1);
    const result = validateMatchRequest({ ...validRequest, bio: longBio });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /bio.*too long/i);
  });

  it('rejects missing topRepositories', () => {
    const { topRepositories, ...rest } = validRequest;
    const result = validateMatchRequest(rest);
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /topRepositories/i);
  });

  it('rejects non-array topRepositories', () => {
    const result = validateMatchRequest({ ...validRequest, topRepositories: 'user/repo' });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /topRepositories.*array/i);
  });

  it('accepts empty topRepositories array', () => {
    const result = validateMatchRequest({ ...validRequest, topRepositories: [] });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.topRepositories.length, 0);
  });

  it('rejects topRepositories with non-string elements', () => {
    const result = validateMatchRequest({
      ...validRequest,
      topRepositories: ['user/repo1', 123],
    });
    assert.strictEqual(result.ok, false);
    assert.match(result.error, /strings/i);
  });

  it('filters out empty repos after normalization', () => {
    const result = validateMatchRequest({
      ...validRequest,
      topRepositories: ['user/repo1', '  ', '', 'user/repo2'],
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.topRepositories.length, 2);
  });

  it('trims whitespace from skill strings', () => {
    const result = validateMatchRequest({
      ...validRequest,
      declaredSkills: ['  JavaScript  ', 'Python'],
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.declaredSkills[0], 'JavaScript');
  });

  it('trims whitespace from uid', () => {
    const result = validateMatchRequest({
      ...validRequest,
      uid: '  test-user-123  ',
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.uid, 'test-user-123');
  });

  it('trims whitespace from repository names', () => {
    const result = validateMatchRequest({
      ...validRequest,
      topRepositories: ['  user/repo1  ', 'user/repo2'],
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.data.topRepositories[0], 'user/repo1');
  });
});

describe('normalizeSkill', () => {
  it('trims whitespace', () => {
    assert.strictEqual(normalizeSkill('  JavaScript  '), 'JavaScript');
  });

  it('preserves case', () => {
    assert.strictEqual(normalizeSkill('JavaScript'), 'JavaScript');
    assert.strictEqual(normalizeSkill('JAVASCRIPT'), 'JAVASCRIPT');
  });

  it('returns empty string for empty input', () => {
    assert.strictEqual(normalizeSkill(''), '');
    assert.strictEqual(normalizeSkill('   '), '');
  });

  it('handles non-string input', () => {
    assert.strictEqual(normalizeSkill(null), '');
    assert.strictEqual(normalizeSkill(undefined), '');
    assert.strictEqual(normalizeSkill(123), '');
  });
});

describe('getSkillCanonical', () => {
  it('converts to lowercase', () => {
    assert.strictEqual(getSkillCanonical('JavaScript'), 'javascript');
    assert.strictEqual(getSkillCanonical('PYTHON'), 'python');
  });

  it('handles common aliases', () => {
    assert.strictEqual(getSkillCanonical('JS'), 'javascript');
    assert.strictEqual(getSkillCanonical('js'), 'javascript');
    assert.strictEqual(getSkillCanonical('TS'), 'typescript');
    assert.strictEqual(getSkillCanonical('ts'), 'typescript');
    assert.strictEqual(getSkillCanonical('Py'), 'python');
    assert.strictEqual(getSkillCanonical('golang'), 'go');
  });

  it('handles React variants', () => {
    assert.strictEqual(getSkillCanonical('React'), 'react');
    assert.strictEqual(getSkillCanonical('React.js'), 'react');
    assert.strictEqual(getSkillCanonical('ReactJS'), 'react');
  });

  it('handles Node.js variants', () => {
    assert.strictEqual(getSkillCanonical('Node.js'), 'nodejs');
    assert.strictEqual(getSkillCanonical('Node'), 'nodejs');
    assert.strictEqual(getSkillCanonical('node'), 'nodejs');
  });

  it('handles C++ and C#', () => {
    assert.strictEqual(getSkillCanonical('C++'), 'cpp');
    assert.strictEqual(getSkillCanonical('C#'), 'csharp');
  });

  it('returns lowercase for unrecognized skills', () => {
    assert.strictEqual(getSkillCanonical('Rust'), 'rust');
    assert.strictEqual(getSkillCanonical('Swift'), 'swift');
  });
});

describe('skillsMatch', () => {
  it('matches case-insensitive', () => {
    assert.strictEqual(skillsMatch('JavaScript', 'javascript'), true);
    assert.strictEqual(skillsMatch('PYTHON', 'python'), true);
  });

  it('matches with aliases', () => {
    assert.strictEqual(skillsMatch('JS', 'JavaScript'), true);
    assert.strictEqual(skillsMatch('TS', 'TypeScript'), true);
    assert.strictEqual(skillsMatch('golang', 'Go'), true);
  });

  it('matches React variants', () => {
    assert.strictEqual(skillsMatch('React', 'React.js'), true);
    assert.strictEqual(skillsMatch('ReactJS', 'React'), true);
  });

  it('matches Node.js variants', () => {
    assert.strictEqual(skillsMatch('Node', 'Node.js'), true);
    assert.strictEqual(skillsMatch('node', 'nodejs'), true);
  });

  it('does not match different skills', () => {
    assert.strictEqual(skillsMatch('JavaScript', 'Python'), false);
    assert.strictEqual(skillsMatch('React', 'Vue'), false);
  });

  it('matches exact same skill', () => {
    assert.strictEqual(skillsMatch('Rust', 'Rust'), true);
    assert.strictEqual(skillsMatch('rust', 'RUST'), true);
  });
});
