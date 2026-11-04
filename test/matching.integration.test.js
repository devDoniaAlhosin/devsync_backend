const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

// Store original functions to restore later
let originalFetchProjects;
let originalScoreWithGemini;

describe('generateMatches controller', () => {
  const mockProfile = {
    uid: 'user-123',
    declaredSkills: ['JavaScript', 'React'],
    githubLanguages: { JavaScript: 5000 },
    publicRepoCount: 10,
    totalContributions: 500,
    bio: 'Developer',
    topRepositories: ['user/repo1'],
  };

  const mockProjects = [
    {
      projectId: 'proj-1',
      projectName: 'Test Project 1',
      description: 'A test project',
      githubUrl: 'https://github.com/test/proj1',
      neededSkills: ['JavaScript', 'React'],
      maintainerId: 'maintainer-1',
    },
    {
      projectId: 'proj-2',
      projectName: 'Test Project 2',
      description: 'Another test',
      githubUrl: 'https://github.com/test/proj2',
      neededSkills: ['Python'],
      maintainerId: null,
    },
  ];

  before(() => {
    // Store originals
    const projectFetcher = require('../src/matching/projectFetcher');
    const geminiClient = require('../src/matching/geminiClient');
    originalFetchProjects = projectFetcher.fetchCandidateProjects;
    originalScoreWithGemini = geminiClient.scoreWithGemini;

    // Mock fetchCandidateProjects
    projectFetcher.fetchCandidateProjects = async () => mockProjects;
    
    // Mock scoreWithGemini to return null (use fallback)
    geminiClient.scoreWithGemini = async () => null;
  });

  after(() => {
    // Restore originals
    if (originalFetchProjects) {
      require('../src/matching/projectFetcher').fetchCandidateProjects = originalFetchProjects;
    }
    if (originalScoreWithGemini) {
      require('../src/matching/geminiClient').scoreWithGemini = originalScoreWithGemini;
    }
  });

  function createMockRequest(body) {
    return { body };
  }

  function createMockResponse() {
    const res = {
      statusCode: 200,
      jsonData: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.jsonData = data;
        return this;
      },
    };
    return res;
  }

  it('returns 400 for invalid request', async () => {
    const { generateMatches } = require('../src/matching/controller');
    const req = createMockRequest({ uid: null }); // Invalid: missing uid
    const res = createMockResponse();

    await generateMatches(req, res);

    assert.strictEqual(res.statusCode, 400);
    assert.ok(res.jsonData.error);
  });

  it('returns empty matches for empty skills', async () => {
    const { generateMatches } = require('../src/matching/controller');
    const emptyProfile = { ...mockProfile, declaredSkills: [], githubLanguages: {} };
    const req = createMockRequest(emptyProfile);
    const res = createMockResponse();

    await generateMatches(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.jsonData.matches));
    assert.strictEqual(res.jsonData.matches.length, 0);
    assert.ok(res.jsonData.promptVersion);
  });

  it('returns matches using fallback when Gemini unavailable', async () => {
    const { generateMatches } = require('../src/matching/controller');
    const req = createMockRequest(mockProfile);
    const res = createMockResponse();

    await generateMatches(req, res);

    assert.strictEqual(res.statusCode, 200);
    assert.ok(Array.isArray(res.jsonData.matches));
    assert.ok(res.jsonData.matches.length > 0);
    assert.strictEqual(res.jsonData.matches[0].projectId, 'proj-1'); // Perfect match should be first
    assert.ok(res.jsonData.matches[0].isFallback); // Should be fallback
    assert.ok(res.jsonData.promptVersion);
  });

  it('returns sorted matches descending by score', async () => {
    const { generateMatches } = require('../src/matching/controller');
    const req = createMockRequest(mockProfile);
    const res = createMockResponse();

    await generateMatches(req, res);

    assert.strictEqual(res.statusCode, 200);
    const matches = res.jsonData.matches;
    
    // Verify descending order
    for (let i = 0; i < matches.length - 1; i++) {
      assert.ok(matches[i].score >= matches[i + 1].score);
    }
  });

  it('returns contract-compliant response structure', async () => {
    const { generateMatches } = require('../src/matching/controller');
    const req = createMockRequest(mockProfile);
    const res = createMockResponse();

    await generateMatches(req, res);

    assert.strictEqual(res.statusCode, 200);
    
    // Verify top-level structure
    assert.ok(res.jsonData.matches);
    assert.ok(res.jsonData.promptVersion);
    
    // Verify match item structure
    const match = res.jsonData.matches[0];
    assert.ok(match.projectId);
    assert.ok(match.projectName);
    assert.ok(typeof match.description === 'string');
    assert.ok(typeof match.githubUrl === 'string');
    assert.ok(Array.isArray(match.neededSkills));
    assert.ok(typeof match.score === 'number');
    assert.ok(typeof match.reason === 'string');
    assert.ok(typeof match.isFallback === 'boolean');
    // maintainerId can be null
  });
});

describe('projectFetcher', () => {
  const { mapFirestoreProject } = require('../src/matching/projectFetcher');

  it('maps valid Firestore project', () => {
    const data = {
      title: 'Test Project',
      description: 'A test',
      githubUrl: 'https://github.com/test/proj',
      techStack: ['JavaScript', 'React'],
      maintainerId: 'user-123',
    };
    const result = mapFirestoreProject('doc-1', data);
    assert.ok(result);
    assert.strictEqual(result.projectId, 'doc-1');
    assert.strictEqual(result.projectName, 'Test Project');
    assert.deepStrictEqual(result.neededSkills, ['JavaScript', 'React']);
  });

  it('returns null for project without title', () => {
    const data = {
      description: 'Missing title',
      techStack: ['JavaScript'],
    };
    const result = mapFirestoreProject('doc-1', data);
    assert.strictEqual(result, null);
  });

  it('handles alternative field names', () => {
    const data = {
      name: 'Alternative Name',
      skills: ['Python'],
      github: 'https://github.com/alt/proj',
      ownerId: 'owner-123',
    };
    const result = mapFirestoreProject('doc-2', data);
    assert.ok(result);
    assert.strictEqual(result.projectName, 'Alternative Name');
    assert.deepStrictEqual(result.neededSkills, ['Python']);
    assert.strictEqual(result.githubUrl, 'https://github.com/alt/proj');
    assert.strictEqual(result.maintainerId, 'owner-123');
  });

  it('handles missing optional fields', () => {
    const data = {
      title: 'Minimal Project',
    };
    const result = mapFirestoreProject('doc-3', data);
    assert.ok(result);
    assert.strictEqual(result.description, '');
    assert.strictEqual(result.githubUrl, '');
    assert.strictEqual(result.maintainerId, null);
    assert.deepStrictEqual(result.neededSkills, []);
  });

  it('filters non-string values from techStack', () => {
    const data = {
      title: 'Project',
      techStack: ['JavaScript', 123, 'Python', null, 'React'],
    };
    const result = mapFirestoreProject('doc-4', data);
    assert.deepStrictEqual(result.neededSkills, ['JavaScript', 'Python', 'React']);
  });
});
