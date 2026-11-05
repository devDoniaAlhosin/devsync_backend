/**
 * Gemini AI client for developer-project matching.
 *
 * Calls Google's Generative AI API with structured output for scoring.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const { buildMatchingPrompt, PROMPT_VERSION } = require('./prompt');

const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const REQUEST_TIMEOUT_MS = 4000; // Bound inference; fallback requires no additional call.
const MAX_OUTPUT_TOKENS = 2048;

/**
 * Initialize the Gemini client if API key is available.
 *
 * @returns {object|null} - Gemini client or null if not configured
 */
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    return null;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey.trim());
    const modelName = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const model = genAI.getGenerativeModel({ model: modelName }, { timeout: REQUEST_TIMEOUT_MS });
    return { model, modelName };
  } catch (error) {
    console.error('[gemini] Failed to initialize client:', error.message);
    return null;
  }
}

/**
 * Score candidate projects using Gemini AI.
 *
 * @param {object} profile - Validated developer profile
 * @param {object[]} projects - Candidate projects
 * @returns {Promise<object|null>} - Scoring results or null on failure
 */
async function scoreWithGemini(profile, projects, clientOverride) {
  const client = clientOverride === undefined ? getGeminiClient() : clientOverride;
  if (!client) {
    console.log('[gemini] API key not configured, using fallback');
    return null;
  }

  if (!projects || projects.length === 0) {
    console.log('[gemini] No projects to score');
    return { matches: [], promptVersion: PROMPT_VERSION };
  }

  try {
    const prompt = buildMatchingPrompt(profile, projects);
    const { model, modelName } = client;

    console.log(`[gemini] Requesting scores from ${modelName} for ${projects.length} projects`);

    // Make the API call with timeout
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'array', items: { type: 'object', properties: {
            projectId: { type: 'string' }, score: { type: 'integer' },
            reason: { type: 'string' },
          }, required: ['projectId', 'score', 'reason'] },
        },
      },
    });

    const response = await result.response;
    const text = response.text();

    if (!text || text.trim().length === 0) {
      console.error('[gemini] Empty response from API');
      return null;
    }

    // Parse and validate JSON response
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (parseError) {
      console.error('[gemini] Invalid JSON response');
      return null;
    }

    // Validate and sanitize the response
    const validated = validateGeminiResponse(parsed, projects);
    if (!validated) {
      console.error('[gemini] Response validation failed');
      return null;
    }

    console.log(`[gemini] Successfully scored ${validated.matches.length} projects`);
    return {
      matches: completeMatches(validated.matches, profile, projects),
      promptVersion: PROMPT_VERSION,
    };
  } catch (error) {
    // Log error without exposing sensitive details
    if (error.message === 'Gemini request timeout') {
      console.error('[gemini] Request timed out after', REQUEST_TIMEOUT_MS, 'ms');
    } else if (error.statusCode === 429) {
      console.error('[gemini] Rate limit exceeded');
    } else if (error.statusCode >= 500) {
      console.error('[gemini] Server error:', error.statusCode);
    } else {
      console.error('[gemini] Request failed');
    }
    return null;
  }
}

/**
 * Validate and sanitize Gemini's response.
 *
 * @param {any} response - Parsed JSON response
 * @param {object[]} projects - Original candidate projects
 * @returns {object|null} - Validated response or null
 */
function validateGeminiResponse(response, projects) {
  // Response should be an array
  if (!Array.isArray(response)) {
    console.error('[gemini] Response is not an array');
    return null;
  }

  // Build a map of valid project IDs
  const validProjectIds = new Set(projects.map((p) => p.projectId));
  const projectMap = new Map(projects.map((p) => [p.projectId, p]));

  const matches = [];
  const seenIds = new Set();

  for (const item of response) {
    if (!item || typeof item !== 'object') {
      console.warn('[gemini] Skipping invalid item:', item);
      continue;
    }

    const { projectId, score, reason } = item;

    // Validate projectId
    if (!projectId || typeof projectId !== 'string') {
      console.warn('[gemini] Missing or invalid projectId');
      continue;
    }

    // Only accept projects from the original list
    if (!validProjectIds.has(projectId)) {
      console.warn('[gemini] Unknown projectId:', projectId);
      continue;
    }

    // Skip duplicates
    if (seenIds.has(projectId)) {
      console.warn('[gemini] Duplicate projectId:', projectId);
      continue;
    }
    seenIds.add(projectId);

    // Validate score
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      console.warn('[gemini] Invalid score for', projectId, ':', score);
      continue;
    }

    // Clamp score to 0-100
    const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

    // Validate reason
    const sanitizedReason = sanitizeReason(reason);

    // Get full project data
    const project = projectMap.get(projectId);

    matches.push({
      projectId,
      projectName: project.projectName,
      description: project.description || '',
      githubUrl: project.githubUrl || '',
      neededSkills: project.neededSkills || [],
      score: clampedScore,
      reason: sanitizedReason,
      maintainerId: project.maintainerId || null,
      isFallback: false, // Gemini result, not fallback
    });
  }

  if (matches.length === 0) {
    console.error('[gemini] No valid matches after validation');
    return null;
  }

  return { matches };
}

/**
 * Sanitize the AI-generated reason text.
 *
 * @param {any} reason - Reason from AI
 * @returns {string} - Safe reason string
 */
function sanitizeReason(reason) {
  if (typeof reason !== 'string') return 'No reason provided';
  
  // Truncate to reasonable length
  let sanitized = reason.slice(0, 300);
  
  // Remove newlines
  sanitized = sanitized.replace(/\n+/g, ' ');
  
  // Normalize whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  
  return sanitized || 'No reason provided';
}

// Missing or invalid items use evidence-based scores, never invented AI reasons.
function completeMatches(matches, profile, projects) {
  const byId = new Map(matches.map(m => [m.projectId, m]));
  const { scoreMatches } = require('./scoring');
  return scoreMatches(profile, projects).map(fallback => {
    const match = byId.get(fallback.projectId);
    return match && match.reason !== 'No reason provided' ? match : fallback;
  });
}

module.exports = {
  completeMatches,
  scoreWithGemini,
  getGeminiClient,
  validateGeminiResponse,
  sanitizeReason,
  DEFAULT_MODEL,
};
