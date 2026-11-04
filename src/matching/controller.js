/**
 * Matching endpoint controller.
 *
 * Orchestrates validation, project fetching, AI scoring, and fallback.
 */

const { validateMatchRequest } = require('./validation');
const { scoreWithGemini } = require('./geminiClient');
const { scoreMatches } = require('./scoring');
const { fetchCandidateProjects } = require('./projectFetcher');
const { PROMPT_VERSION } = require('./prompt');

/**
 * Handle POST /matches/generate request.
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 */
async function generateMatches(req, res) {
  // Validate request
  const validation = validateMatchRequest(req.body);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.error });
  }

  const profile = validation.data;

  // Handle empty skills early
  if (profile.declaredSkills.length === 0 && Object.keys(profile.githubLanguages).length === 0) {
    console.log('[matching] Empty skills, returning empty matches');
    return res.json({
      matches: [],
      promptVersion: PROMPT_VERSION,
    });
  }

  try {
    // Fetch candidate projects from Firestore
    const projects = await fetchCandidateProjects();

    if (projects.length === 0) {
      console.log('[matching] No projects available');
      return res.json({
        matches: [],
        promptVersion: PROMPT_VERSION,
      });
    }

    console.log(`[matching] Processing ${projects.length} projects for user ${profile.uid}`);

    // Try Gemini scoring first
    let result = await scoreWithGemini(profile, projects);

    // If Gemini failed or is not configured, use deterministic fallback
    if (!result || !result.matches) {
      console.log('[matching] Using deterministic fallback scorer');
      const fallbackMatches = scoreMatches(profile, projects);
      result = {
        matches: fallbackMatches,
        promptVersion: PROMPT_VERSION,
      };
    }

    // Sort matches by score descending (already sorted by fallback, ensure for Gemini)
    result.matches.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      return a.projectId.localeCompare(b.projectId); // Deterministic tie-break
    });

    return res.json(result);
  } catch (error) {
    console.error('[matching] Unexpected error:', error.message);
    return res.status(500).json({
      error: 'An error occurred while generating matches',
    });
  }
}

module.exports = {
  generateMatches,
};
