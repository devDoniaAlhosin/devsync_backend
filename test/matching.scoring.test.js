const { describe, it } = require('node:test');
const assert = require('node:assert');
const { scoreMatches, calculateActivityBonus, generateReason } = require('../src/matching/scoring');

describe('scoreMatches', () => {
  const baseProfile = {
    uid: 'user-123',
    declaredSkills: ['JavaScript', 'React', 'Node.js'],
    githubLanguages: { JavaScript: 5000, TypeScript: 2000 },
    publicRepoCount: 10,
    totalContributions: 500,
    bio: 'Full-stack developer',
    topRepositories: ['user/repo1'],
  };

  const baseProject = {
    projectId: 'proj-1',
    projectName: 'Test Project',
    description: 'A test project',
    githubUrl: 'https://github.com/test/project',
    neededSkills: ['JavaScript', 'React'],
    maintainerId: 'maintainer-123',
  };

  it('returns empty array for null profile', () => {
    const results = scoreMatches(null, [baseProject]);
    assert.deepStrictEqual(results, []);
  });

  it('returns empty array for null projects', () => {
    const results = scoreMatches(baseProfile, null);
    assert.deepStrictEqual(results, []);
  });

  it('returns empty array for non-array projects', () => {
    const results = scoreMatches(baseProfile, baseProject);
    assert.deepStrictEqual(results, []);
  });

  it('returns empty array for empty projects list', () => {
    const results = scoreMatches(baseProfile, []);
    assert.deepStrictEqual(results, []);
  });

  it('scores perfect match at 100 (all skills matched)', () => {
    const results = scoreMatches(baseProfile, [baseProject]);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].score, 100);
    assert.strictEqual(results[0].projectId, 'proj-1');
    assert.match(results[0].reason, /perfect match/i);
  });

  it('sets isFallback to true on all results', () => {
    const results = scoreMatches(baseProfile, [baseProject]);
    assert.strictEqual(results[0].isFallback, true);
  });

  it('preserves all project fields in output', () => {
    const results = scoreMatches(baseProfile, [baseProject]);
    const match = results[0];
    assert.strictEqual(match.projectId, 'proj-1');
    assert.strictEqual(match.projectName, 'Test Project');
    assert.strictEqual(match.description, 'A test project');
    assert.strictEqual(match.githubUrl, 'https://github.com/test/project');
    assert.deepStrictEqual(match.neededSkills, ['JavaScript', 'React']);
    assert.strictEqual(match.maintainerId, 'maintainer-123');
  });

  it('handles missing optional project fields', () => {
    const minimal = {
      projectId: 'proj-2',
      projectName: 'Minimal',
      neededSkills: ['JavaScript'],
    };
    const results = scoreMatches(baseProfile, [minimal]);
    assert.strictEqual(results[0].description, '');
    assert.strictEqual(results[0].githubUrl, '');
    assert.strictEqual(results[0].maintainerId, null);
  });

  it('scores partial match correctly (50% coverage)', () => {
    const project = {
      ...baseProject,
      neededSkills: ['JavaScript', 'React', 'Python', 'Django'],
    };
    const results = scoreMatches(baseProfile, [project]);
    // 2 out of 4 = 50% + activity bonus
    assert.ok(results[0].score >= 50);
    assert.ok(results[0].score <= 60); // With activity bonus
    assert.match(results[0].reason, /match/i);
  });

  it('scores zero match at low score', () => {
    const project = {
      ...baseProject,
      neededSkills: ['Rust', 'Go', 'C++'],
    };
    const results = scoreMatches(baseProfile, [project]);
    // 0 matches + activity bonus
    assert.ok(results[0].score <= 10);
    assert.match(results[0].reason, /missing all/i);
  });

  it('handles project with no needed skills (baseline 50)', () => {
    const project = {
      ...baseProject,
      neededSkills: [],
    };
    const results = scoreMatches(baseProfile, [project]);
    assert.strictEqual(results[0].score, 50);
    assert.match(results[0].reason, /no specific skill requirements/i);
  });

  it('matches skills case-insensitively', () => {
    const profile = {
      ...baseProfile,
      declaredSkills: ['javascript', 'REACT', 'Node.JS'],
    };
    const results = scoreMatches(profile, [baseProject]);
    assert.strictEqual(results[0].score, 100);
  });

  it('matches skill aliases (JS -> JavaScript)', () => {
    const profile = {
      ...baseProfile,
      declaredSkills: ['JS', 'React', 'Node'],
    };
    const project = {
      ...baseProject,
      neededSkills: ['JavaScript', 'React', 'Node.js'],
    };
    const results = scoreMatches(profile, [project]);
    assert.strictEqual(results[0].score, 100);
  });

  it('uses GitHub languages as supporting evidence', () => {
    const profile = {
      ...baseProfile,
      declaredSkills: ['React'], // Only React declared
      githubLanguages: { JavaScript: 5000, Python: 3000 },
    };
    const project = {
      ...baseProject,
      neededSkills: ['JavaScript', 'React'],
    };
    const results = scoreMatches(profile, [project]);
    // Both skills matched (JavaScript from GitHub, React from declared)
    assert.strictEqual(results[0].score, 100);
  });

  it('sorts by score descending', () => {
    const projects = [
      { ...baseProject, projectId: 'proj-1', neededSkills: ['Rust', 'Go', 'C++'] }, // Low score (0%)
      { ...baseProject, projectId: 'proj-2', neededSkills: ['JavaScript', 'React', 'Node.js'] }, // High score (100%)
      { ...baseProject, projectId: 'proj-3', neededSkills: ['JavaScript', 'Python', 'Go', 'Rust'] }, // Medium score (25%)
    ];
    const results = scoreMatches(baseProfile, projects);
    assert.strictEqual(results[0].projectId, 'proj-2'); // Highest score first (100%)
    assert.strictEqual(results[2].projectId, 'proj-1'); // Lowest score last (0%)
    assert.ok(results[0].score > results[1].score);
    assert.ok(results[1].score > results[2].score);
  });

  it('tie-breaks deterministically by projectId', () => {
    const profile = {
      ...baseProfile,
      declaredSkills: ['Dart'],
      githubLanguages: {},
      publicRepoCount: 0,
      totalContributions: 0,
    };
    const projects = [
      { ...baseProject, projectId: 'proj-c', neededSkills: ['Rust'] },
      { ...baseProject, projectId: 'proj-a', neededSkills: ['Go'] },
      { ...baseProject, projectId: 'proj-b', neededSkills: ['Python'] },
    ];
    const results = scoreMatches(profile, projects);
    // All have same score (0), so should be sorted alphabetically
    assert.strictEqual(results[0].projectId, 'proj-a');
    assert.strictEqual(results[1].projectId, 'proj-b');
    assert.strictEqual(results[2].projectId, 'proj-c');
  });

  it('handles multiple projects and returns all', () => {
    const projects = [
      { ...baseProject, projectId: 'proj-1' },
      { ...baseProject, projectId: 'proj-2' },
      { ...baseProject, projectId: 'proj-3' },
    ];
    const results = scoreMatches(baseProfile, projects);
    assert.strictEqual(results.length, 3);
  });

  it('handles profile with empty skills array', () => {
    const profile = {
      ...baseProfile,
      declaredSkills: [],
      githubLanguages: {},
    };
    const results = scoreMatches(profile, [baseProject]);
    assert.strictEqual(results.length, 0);
  });

  it('handles missing githubLanguages gracefully', () => {
    const profile = {
      ...baseProfile,
      githubLanguages: undefined,
    };
    const results = scoreMatches(profile, [baseProject]);
    assert.strictEqual(results.length, 1);
    assert.ok(results[0].score >= 50); // Still matches declared skills
  });

  it('handles missing declaredSkills gracefully', () => {
    const profile = {
      ...baseProfile,
      declaredSkills: undefined,
    };
    const results = scoreMatches(profile, [baseProject]);
    assert.strictEqual(results.length, 0);
  });

  it('preserves original skill casing from project in results', () => {
    const project = {
      ...baseProject,
      neededSkills: ['JavaScript', 'ReAcT', 'Node.JS'],
    };
    const results = scoreMatches(baseProfile, [project]);
    assert.deepStrictEqual(results[0].neededSkills, ['JavaScript', 'ReAcT', 'Node.JS']);
  });
});

describe('calculateActivityBonus', () => {
  it('returns 0 for no activity', () => {
    const profile = { publicRepoCount: 0, totalContributions: 0 };
    assert.strictEqual(calculateActivityBonus(profile), 0);
  });

  it('awards bonus for public repos', () => {
    const profile = { publicRepoCount: 10, totalContributions: 0 };
    const bonus = calculateActivityBonus(profile);
    assert.ok(bonus > 0);
    assert.ok(bonus <= 5);
  });

  it('awards bonus for contributions', () => {
    const profile = { publicRepoCount: 0, totalContributions: 500 };
    const bonus = calculateActivityBonus(profile);
    assert.ok(bonus > 0);
    assert.ok(bonus <= 5);
  });

  it('combines repo and contribution bonuses', () => {
    const profile = { publicRepoCount: 25, totalContributions: 1000 };
    const bonus = calculateActivityBonus(profile);
    assert.ok(bonus > 5); // Should be more than single source
    assert.ok(bonus <= 10); // Capped at 10
  });

  it('caps total bonus at 10', () => {
    const profile = { publicRepoCount: 1000, totalContributions: 10000 };
    const bonus = calculateActivityBonus(profile);
    assert.strictEqual(bonus, 10);
  });

  it('handles edge case: exactly 5 repos', () => {
    const profile = { publicRepoCount: 5, totalContributions: 0 };
    const bonus = calculateActivityBonus(profile);
    assert.strictEqual(bonus, 1);
  });

  it('handles edge case: exactly 200 contributions', () => {
    const profile = { publicRepoCount: 0, totalContributions: 200 };
    const bonus = calculateActivityBonus(profile);
    assert.strictEqual(bonus, 1);
  });
});

describe('generateReason', () => {
  it('generates reason for perfect match (all skills)', () => {
    const matched = ['JavaScript', 'React', 'Node.js'];
    const missing = [];
    const needed = matched;
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /perfect match/i);
    assert.match(reason, /JavaScript/);
  });

  it('generates reason for perfect match (single skill)', () => {
    const matched = ['JavaScript'];
    const missing = [];
    const needed = matched;
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /perfect match/i);
    assert.match(reason, /JavaScript/);
  });

  it('generates reason for zero matches', () => {
    const matched = [];
    const missing = ['Rust', 'Go', 'C++'];
    const needed = missing;
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /missing all/i);
    assert.match(reason, /Rust/);
  });

  it('generates reason for strong partial match (more matches than gaps)', () => {
    const matched = ['JavaScript', 'React', 'Node.js'];
    const missing = ['TypeScript'];
    const needed = [...matched, ...missing];
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /strong match/i);
    assert.match(reason, /JavaScript/);
    assert.match(reason, /TypeScript/);
  });

  it('generates reason for moderate match (equal matches and gaps)', () => {
    const matched = ['JavaScript', 'React'];
    const missing = ['Python', 'Django'];
    const needed = [...matched, ...missing];
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /moderate match/i);
  });

  it('generates reason for weak match (more gaps than matches)', () => {
    const matched = ['JavaScript'];
    const missing = ['Python', 'Django', 'PostgreSQL'];
    const needed = [...matched, ...missing];
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /partial match/i);
  });

  it('truncates long skill lists with ellipsis', () => {
    const matched = ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Vue'];
    const missing = ['Python', 'Django', 'PostgreSQL', 'Redis'];
    const needed = [...matched, ...missing];
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /\.\.\./);
  });

  it('handles single matched and single missing', () => {
    const matched = ['JavaScript'];
    const missing = ['Python'];
    const needed = [...matched, ...missing];
    const reason = generateReason(matched, missing, needed);
    assert.match(reason, /JavaScript/);
    assert.match(reason, /Python/);
  });
});
