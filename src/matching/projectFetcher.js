/**
 * Fetch candidate projects from Firestore for matching.
 *
 * Queries the projects collection and returns projects in the format
 * expected by the scoring modules.
 */

const { getAdmin } = require('../firebaseAdmin');

const MAX_PROJECTS = 100; // Limit to prevent token budget issues
const COLLECTION_NAME = 'projects';

/**
 * Fetch candidate projects from Firestore.
 *
 * @param {number} limit - Maximum number of projects to fetch (default: 100)
 * @returns {Promise<object[]>} - Array of project objects
 */
async function fetchCandidateProjects(limit = MAX_PROJECTS) {
  const admin = getAdmin();
  if (!admin) {
    console.warn('[projectFetcher] Firebase Admin not configured, returning empty list');
    return [];
  }

  try {
    const firestore = admin.firestore();
    const projectsRef = firestore.collection(COLLECTION_NAME);

    // Query active projects (assuming they have some indicator)
    // For now, fetch all projects and limit the count
    const snapshot = await projectsRef.limit(Math.min(limit, MAX_PROJECTS)).get();

    if (snapshot.empty) {
      console.log('[projectFetcher] No projects found in Firestore');
      return [];
    }

    const projects = [];
    snapshot.forEach((doc) => {
      try {
        const data = doc.data();
        
        // Map Firestore document to matching contract format
        const project = mapFirestoreProject(doc.id, data);
        if (project) {
          projects.push(project);
        }
      } catch (error) {
        console.warn(`[projectFetcher] Failed to map project ${doc.id}:`, error.message);
      }
    });

    console.log(`[projectFetcher] Fetched ${projects.length} candidate projects`);
    return projects;
  } catch (error) {
    console.error('[projectFetcher] Failed to fetch projects from Firestore:', error.message);
    return [];
  }
}

/**
 * Map a Firestore project document to the matching format.
 *
 * Expected Firestore fields (based on Flutter Project entity):
 * - title: string
 * - description: string
 * - githubUrl: string
 * - techStack: string[] (maps to neededSkills)
 * - maintainerId / ownerId: string (optional)
 *
 * @param {string} docId - Firestore document ID
 * @param {object} data - Firestore document data
 * @returns {object|null} - Mapped project or null if invalid
 */
function mapFirestoreProject(docId, data) {
  if (!data || typeof data !== 'object') {
    return null;
  }

  // Required fields
  const title = data.title || data.projectName || data.name;
  if (!title || typeof title !== 'string') {
    console.warn(`[projectFetcher] Project ${docId} missing title`);
    return null;
  }

  // Map techStack to neededSkills
  let neededSkills = [];
  if (Array.isArray(data.techStack)) {
    neededSkills = data.techStack.filter((s) => typeof s === 'string');
  } else if (Array.isArray(data.neededSkills)) {
    neededSkills = data.neededSkills.filter((s) => typeof s === 'string');
  } else if (Array.isArray(data.skills)) {
    neededSkills = data.skills.filter((s) => typeof s === 'string');
  }

  // Optional fields
  const description = data.description || '';
  const githubUrl = data.githubUrl || data.github || data.repoUrl || '';
  const maintainerId = data.maintainerId || data.ownerId || data.owner || null;

  return {
    projectId: docId,
    projectName: title,
    description: typeof description === 'string' ? description : '',
    githubUrl: typeof githubUrl === 'string' ? githubUrl : '',
    neededSkills: neededSkills,
    maintainerId: typeof maintainerId === 'string' ? maintainerId : null,
  };
}

module.exports = {
  fetchCandidateProjects,
  mapFirestoreProject,
  MAX_PROJECTS,
};
