/**
 * Request validation and normalization for matching endpoint.
 *
 * Validates the incoming MatchRequestModel JSON against the Flutter contract
 * and normalizes skill strings for consistent matching.
 */

const MAX_SKILLS = 100;
const MAX_SKILL_LENGTH = 100;
const MAX_BIO_LENGTH = 5000;
const MAX_REPO_NAME_LENGTH = 200;
const MAX_TOP_REPOS = 50;
const MAX_LANGUAGES = 100;

/**
 * Validates and normalizes a match request body.
 *
 * @param {any} body - Raw request body from Express
 * @returns {{ok: true, data: object} | {ok: false, error: string}}
 */
function validateMatchRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  // Required: uid
  if (typeof body.uid !== 'string' || body.uid.trim().length === 0) {
    return { ok: false, error: 'uid is required and must be a non-empty string' };
  }

  const uid = body.uid.trim();
  if (uid.length > 128) {
    return { ok: false, error: 'uid is too long' };
  }

  // Required: declaredSkills (array of strings)
  if (!Array.isArray(body.declaredSkills)) {
    return { ok: false, error: 'declaredSkills must be an array' };
  }

  if (body.declaredSkills.length > MAX_SKILLS) {
    return { ok: false, error: `Too many skills (max ${MAX_SKILLS})` };
  }

  const declaredSkills = [];
  for (const skill of body.declaredSkills) {
    if (typeof skill !== 'string') {
      return { ok: false, error: 'declaredSkills must contain only strings' };
    }
    const normalized = normalizeSkill(skill);
    if (normalized.length > MAX_SKILL_LENGTH) {
      return { ok: false, error: `Skill name too long (max ${MAX_SKILL_LENGTH} chars)` };
    }
    if (normalized.length > 0) {
      declaredSkills.push(normalized);
    }
  }

  // Required: githubLanguages (object with string keys and number values)
  if (typeof body.githubLanguages !== 'object' || body.githubLanguages === null) {
    return { ok: false, error: 'githubLanguages must be an object' };
  }

  if (Array.isArray(body.githubLanguages)) {
    return { ok: false, error: 'githubLanguages must be an object, not an array' };
  }

  const githubLanguages = {};
  const langKeys = Object.keys(body.githubLanguages);
  if (langKeys.length > MAX_LANGUAGES) {
    return { ok: false, error: `Too many languages (max ${MAX_LANGUAGES})` };
  }

  for (const lang of langKeys) {
    const value = body.githubLanguages[lang];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return { ok: false, error: `githubLanguages['${lang}'] must be a non-negative number` };
    }
    const normalizedLang = normalizeSkill(lang);
    if (normalizedLang.length > 0) {
      githubLanguages[normalizedLang] = Math.floor(value);
    }
  }

  // Required: publicRepoCount (non-negative integer)
  if (typeof body.publicRepoCount !== 'number' || !Number.isFinite(body.publicRepoCount)) {
    return { ok: false, error: 'publicRepoCount must be a number' };
  }

  if (body.publicRepoCount < 0) {
    return { ok: false, error: 'publicRepoCount must be non-negative' };
  }

  const publicRepoCount = Math.floor(body.publicRepoCount);

  // Required: totalContributions (non-negative integer)
  if (typeof body.totalContributions !== 'number' || !Number.isFinite(body.totalContributions)) {
    return { ok: false, error: 'totalContributions must be a number' };
  }

  if (body.totalContributions < 0) {
    return { ok: false, error: 'totalContributions must be non-negative' };
  }

  const totalContributions = Math.floor(body.totalContributions);

  // Optional: bio (string or null)
  let bio = null;
  if (body.bio !== undefined && body.bio !== null) {
    if (typeof body.bio !== 'string') {
      return { ok: false, error: 'bio must be a string or null' };
    }
    bio = body.bio.trim();
    if (bio.length > MAX_BIO_LENGTH) {
      return { ok: false, error: `bio is too long (max ${MAX_BIO_LENGTH} chars)` };
    }
    if (bio.length === 0) {
      bio = null;
    }
  }

  // Required: topRepositories (array of strings)
  if (!Array.isArray(body.topRepositories)) {
    return { ok: false, error: 'topRepositories must be an array' };
  }

  if (body.topRepositories.length > MAX_TOP_REPOS) {
    return { ok: false, error: `Too many top repositories (max ${MAX_TOP_REPOS})` };
  }

  const topRepositories = [];
  for (const repo of body.topRepositories) {
    if (typeof repo !== 'string') {
      return { ok: false, error: 'topRepositories must contain only strings' };
    }
    const normalized = repo.trim();
    if (normalized.length > MAX_REPO_NAME_LENGTH) {
      return { ok: false, error: `Repository name too long (max ${MAX_REPO_NAME_LENGTH} chars)` };
    }
    if (normalized.length > 0) {
      topRepositories.push(normalized);
    }
  }

  // Return normalized and validated data
  return {
    ok: true,
    data: {
      uid,
      declaredSkills,
      githubLanguages,
      publicRepoCount,
      totalContributions,
      bio,
      topRepositories,
    },
  };
}

/**
 * Normalize a skill string for consistent matching.
 * - Trim whitespace
 * - Convert to lowercase for case-insensitive comparison
 * - Preserve original spacing/punctuation for display
 *
 * @param {string} skill - Raw skill string
 * @returns {string} - Normalized skill string
 */
function normalizeSkill(skill) {
  if (typeof skill !== 'string') return '';
  return skill.trim();
}

/**
 * Get the canonical lowercase version of a skill for matching.
 * Handles common aliases (e.g., "JS" → "javascript", "TS" → "typescript").
 *
 * @param {string} skill - Normalized skill string
 * @returns {string} - Lowercase canonical form
 */
function getSkillCanonical(skill) {
  const lower = skill.toLowerCase();
  
  // Common aliases
  const aliases = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'golang': 'go',
    'c++': 'cpp',
    'c#': 'csharp',
    'objective-c': 'objectivec',
    'objective c': 'objectivec',
    'react.js': 'react',
    'reactjs': 'react',
    'vue.js': 'vue',
    'vuejs': 'vue',
    'node.js': 'nodejs',
    'node': 'nodejs',
  };

  return aliases[lower] || lower;
}

/**
 * Check if two skills match (case-insensitive, with alias support).
 *
 * @param {string} skill1 - First skill (normalized)
 * @param {string} skill2 - Second skill (normalized)
 * @returns {boolean} - True if skills match
 */
function skillsMatch(skill1, skill2) {
  return getSkillCanonical(skill1) === getSkillCanonical(skill2);
}

module.exports = {
  validateMatchRequest,
  normalizeSkill,
  getSkillCanonical,
  skillsMatch,
  // Export limits for testing
  MAX_SKILLS,
  MAX_SKILL_LENGTH,
  MAX_BIO_LENGTH,
  MAX_REPO_NAME_LENGTH,
  MAX_TOP_REPOS,
  MAX_LANGUAGES,
};
