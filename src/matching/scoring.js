/**
 * Deterministic skill-based matching fallback.
 *
 * Pure function that scores projects based on developer skills without AI.
 * Used when Gemini is unavailable or as a validation baseline.
 */

const { getSkillCanonical, skillsMatch } = require('./validation');

/**
 * Calculate match scores for candidate projects based on developer profile.
 *
 * @param {object} profile - Validated developer profile
 * @param {string} profile.uid - Firebase UID
 * @param {string[]} profile.declaredSkills - Declared skills (normalized)
 * @param {object} profile.githubLanguages - GitHub language stats (normalized)
 * @param {number} profile.publicRepoCount - Public repo count
 * @param {number} profile.totalContributions - Total contributions
 * @param {string|null} profile.bio - Optional bio
 * @param {string[]} profile.topRepositories - Top repos
 *
 * @param {object[]} projects - Array of project objects from Firestore
 * @param {string} projects[].projectId - Firestore document ID
 * @param {string} projects[].projectName - Display name
 * @param {string} projects[].description - Project description
 * @param {string} projects[].githubUrl - GitHub repository URL
 * @param {string[]} projects[].neededSkills - Required skills
 * @param {string} [projects[].maintainerId] - Maintainer Firebase UID
 *
 * @returns {object[]} - Array of match results sorted by score descending
 */
function scoreMatches(profile, projects) {
  if (!profile || !Array.isArray(projects) || !profile.declaredSkills?.length) {
    return [];
  }

  const results = [];
  const developerSkills = profile.declaredSkills || [];
  const githubLanguages = profile.githubLanguages || {};

  // Build a set of all developer skills (declared + GitHub languages)
  const allDeveloperSkills = new Set();
  developerSkills.forEach((skill) => {
    allDeveloperSkills.add(getSkillCanonical(skill));
  });
  Object.keys(githubLanguages).forEach((lang) => {
    allDeveloperSkills.add(getSkillCanonical(lang));
  });

  for (const project of projects) {
    const neededSkills = project.neededSkills || [];

    // If project has no needed skills, assign a baseline score
    if (neededSkills.length === 0) {
      results.push({
        projectId: project.projectId,
        projectName: project.projectName,
        description: project.description || '',
        githubUrl: project.githubUrl || '',
        neededSkills: [],
        score: 50,
        reason: 'Project has no specific skill requirements',
        maintainerId: project.maintainerId || null,
        isFallback: true,
      });
      continue;
    }

    // Find matched and missing skills
    const matchedSkills = [];
    const missingSkills = [];

    for (const needed of neededSkills) {
      let matched = false;
      const neededCanonical = getSkillCanonical(needed);

      // Check against declared skills
      for (const devSkill of developerSkills) {
        if (skillsMatch(needed, devSkill)) {
          matchedSkills.push(needed); // Use project's original casing
          matched = true;
          break;
        }
      }

      // If not matched, check GitHub languages as supporting evidence
      if (!matched && allDeveloperSkills.has(neededCanonical)) {
        matchedSkills.push(needed);
        matched = true;
      }

      if (!matched) {
        missingSkills.push(needed);
      }
    }

    // Calculate score as percentage of needed skills covered
    const coverageRatio = matchedSkills.length / neededSkills.length;
    let score = Math.round(coverageRatio * 100);

    // Bonus for GitHub activity (up to +10 points)
    const activityBonus = calculateActivityBonus(profile);
    score = Math.min(100, score + activityBonus);

    // Generate reason
    const reason = generateReason(matchedSkills, missingSkills, neededSkills);

    results.push({
      projectId: project.projectId,
      projectName: project.projectName,
      description: project.description || '',
      githubUrl: project.githubUrl || '',
      neededSkills: neededSkills,
      score: score,
      reason: reason,
      maintainerId: project.maintainerId || null,
      isFallback: true,
    });
  }

  // Sort by score descending, with deterministic tie-breaking by projectId
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Deterministic tie-break: alphabetical by projectId
    return a.projectId.localeCompare(b.projectId);
  });

  return results;
}

/**
 * Calculate an activity bonus based on GitHub stats (0-10 points).
 *
 * @param {object} profile - Developer profile
 * @returns {number} - Bonus points (0-10)
 */
function calculateActivityBonus(profile) {
  const { publicRepoCount, totalContributions } = profile;

  let bonus = 0;

  // Public repos: 1 point per 5 repos, up to 5 points
  if (publicRepoCount >= 5) {
    bonus += Math.min(5, Math.floor(publicRepoCount / 5));
  }

  // Contributions: 1 point per 200 contributions, up to 5 points
  if (totalContributions >= 200) {
    bonus += Math.min(5, Math.floor(totalContributions / 200));
  }

  return Math.min(10, bonus);
}

/**
 * Generate a concise, meaningful reason for the match score.
 *
 * @param {string[]} matchedSkills - Skills that matched
 * @param {string[]} missingSkills - Skills that didn't match
 * @param {string[]} neededSkills - All needed skills
 * @returns {string} - Human-readable reason
 */
function generateReason(matchedSkills, missingSkills, neededSkills) {
  const matchCount = matchedSkills.length;
  const totalCount = neededSkills.length;

  if (matchCount === 0) {
    return `Missing all required skills: ${missingSkills.slice(0, 3).join(', ')}${
      missingSkills.length > 3 ? ', ...' : ''
    }`;
  }

  if (matchCount === totalCount) {
    if (matchCount === 1) {
      return `Perfect match: you have ${matchedSkills[0]}`;
    }
    return `Perfect match: you have all required skills (${matchedSkills.slice(0, 3).join(', ')}${
      matchedSkills.length > 3 ? ', ...' : ''
    })`;
  }

  // Partial match
  const matchedList = matchedSkills.slice(0, 2).join(', ');
  const missingList = missingSkills.slice(0, 2).join(', ');

  if (matchCount > missingSkills.length) {
    // More matches than gaps
    return `Strong match: you have ${matchedList}${
      matchedSkills.length > 2 ? ', ...' : ''
    }, missing ${missingList}${missingSkills.length > 2 ? ', ...' : ''}`;
  }

  if (matchCount === missingSkills.length) {
    // Equal matches and gaps
    return `Moderate match: you have ${matchedList}${
      matchedSkills.length > 2 ? ', ...' : ''
    }, missing ${missingList}${missingSkills.length > 2 ? ', ...' : ''}`;
  }

  // More gaps than matches
  return `Partial match: you have ${matchedList}${
    matchedSkills.length > 2 ? ', ...' : ''
  }, but missing ${missingList}${missingSkills.length > 2 ? ', ...' : ''}`;
}

module.exports = {
  scoreMatches,
  calculateActivityBonus,
  generateReason,
};
