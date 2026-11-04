# DevSync Matching Backend — Implementation Plan

**Repository:** `https://github.com/devDoniaAlhosin/devsync_backend`  
**Branch:** `feature/matching-gemini`  
**Target:** Saturday, 7 November 2026  
**Last updated:** 2026-11-04

## Overall Status

🟡 **IN_PROGRESS** - Task B01 completed, starting B02

## Task Breakdown

### B01: Inspect Git, branch, Flutter contract and backend; create plan & handoff

**Status:** ✅ COMPLETED  
**Acceptance Criteria:**
- ✅ Verified Git remote and branch
- ✅ Switched to `feature/matching-gemini` branch
- ✅ Excluded prompt file from Git tracking (`.git/info/exclude`)
- ✅ Inspected `package.json`, `src/index.js`, `src/routes.js`, `src/firebaseAdmin.js`
- ✅ Located and analyzed Flutter contract models
- ✅ Documented exact API contract in `CONTRACT.md`
- ✅ Created `IMPLEMENTATION_PLAN.md` (this file)
- ⏳ Create `AGENT_HANDOFF.md` next

**Key Findings:**
- Flutter sends only user profile, NOT candidate projects
- Backend must fetch projects from Firestore using Firebase Admin SDK
- No authentication token sent from Flutter client
- Response format is direct object (no `{ok, data}` wrapper)
- Matching stub currently returns 501

**Dependencies:** None  
**Blockers:** None

---

### B02: Input schema, normalization and validation

**Status:** 🔵 NOT_STARTED  
**Acceptance Criteria:**
- [ ] Create `src/matching/validation.js` module
- [ ] Validate required fields: `uid`, `declaredSkills`, `githubLanguages`, `publicRepoCount`, `totalContributions`, `topRepositories`
- [ ] Validate optional fields: `bio`
- [ ] Normalize skill strings (trim, case-insensitive matching)
- [ ] Reject requests exceeding 32KB JSON size
- [ ] Handle empty skills array (return empty matches)
- [ ] Validate skill array contains strings only
- [ ] Unit tests for valid/invalid/edge-case requests
- [ ] Test empty skills, missing fields, wrong types, oversized payloads

**Test Command:** `npm test -- --grep "validation"`

**Files to Create:**
- `src/matching/validation.js`
- `test/matching.validation.test.js`

**Dependencies:** B01 completed  
**Estimated:** 30-45 minutes

---

### B03: Deterministic fallback scorer

**Status:** 🔵 NOT_STARTED  
**Acceptance Criteria:**
- [ ] Create `src/matching/scoring.js` with pure function
- [ ] Input: validated profile + array of project objects
- [ ] Skill matching: case-insensitive with common aliases (JS/JavaScript, TS/TypeScript)
- [ ] Optional: use `githubLanguages` as supporting evidence
- [ ] Score formula: percentage of project's needed skills covered by developer
- [ ] Projects with no needed skills: assign baseline score (e.g., 50)
- [ ] Generate meaningful reason based on matched/missing skills
- [ ] Return matched skills array for each project
- [ ] Sort results descending by score, with deterministic tie-breaking
- [ ] Comprehensive unit tests: full match, partial match, no match, aliases, empty inputs
- [ ] No network calls in tests

**Test Command:** `npm test -- --grep "scoring"`

**Files to Create:**
- `src/matching/scoring.js`
- `test/matching.scoring.test.js`

**Dependencies:** B02 completed (uses validated data)  
**Estimated:** 60-75 minutes

---

### B04: Versioned Gemini prompt + provider adapter

**Status:** 🔵 NOT_STARTED  
**Acceptance Criteria:**
- [ ] Install Gemini SDK: `@google/generative-ai` or equivalent
- [ ] Create `src/matching/geminiClient.js`
- [ ] Create `src/matching/prompt.js` with versioned prompt template
- [ ] Use env vars: `GEMINI_API_KEY`, `GEMINI_MODEL` (default: `gemini-2.0-flash-exp` or current lite model)
- [ ] Prompt defends against injection from bio/descriptions (treat as data)
- [ ] Structured JSON output with schema validation
- [ ] Timeout: 10 seconds for API calls
- [ ] Error handling: 429, 5xx, timeout, malformed response
- [ ] Return `null` or error signal on failure (controller will use fallback)
- [ ] Mock/stub tests for success, timeout, malformed output, missing API key
- [ ] Validate scores are 0-100, project IDs match candidates
- [ ] Reject/repair duplicate or unknown project IDs

**Test Command:** `npm test -- --grep "gemini"`

**Files to Create:**
- `src/matching/geminiClient.js`
- `src/matching/prompt.js`
- `src/matching/response.js` (output sanitizer)
- `test/matching.gemini.test.js`

**Environment:**
- `.env`: Add `GEMINI_MODEL=gemini-2.0-flash-exp` (or verify current supported model)
- `.env.example`: Update with model name

**Dependencies:** B03 completed (fallback must work first)  
**Estimated:** 60-90 minutes

---

### B05: Wire POST endpoint + contract mapping

**Status:** 🔵 NOT_STARTED  
**Acceptance Criteria:**
- [ ] Create `src/matching/controller.js`
- [ ] Create `src/matching/projectFetcher.js` to query Firestore projects collection
- [ ] Fetch candidate projects from Firestore (limit to reasonable count, e.g., 50-100)
- [ ] Validate request using B02 module
- [ ] If `GEMINI_API_KEY` present, call Gemini client
- [ ] On Gemini failure/timeout, use deterministic fallback
- [ ] If no key, use fallback and log appropriately
- [ ] Map internal results to exact Flutter response contract
- [ ] Sort by score descending
- [ ] Replace stub in `src/routes.js` with controller call
- [ ] HTTP integration tests prove exact Flutter-compatible JSON
- [ ] Test: empty skills → empty matches
- [ ] Test: Gemini success → structured response
- [ ] Test: Gemini failure → fallback response
- [ ] Test: no GEMINI_API_KEY → fallback response

**Test Command:** `npm test -- --grep "endpoint|integration"`

**Files to Create:**
- `src/matching/controller.js`
- `src/matching/projectFetcher.js`
- `test/matching.integration.test.js`

**Files to Modify:**
- `src/routes.js` (replace stub)

**Dependencies:** B02, B03, B04 completed  
**Estimated:** 75-90 minutes

---

### B06: Cost protection, rate limiting and security

**Status:** 🔵 NOT_STARTED  
**Acceptance Criteria:**
- [ ] Validate JSON request size ≤32KB (already enforced by Express)
- [ ] Limit candidate project count (e.g., max 100 projects per request)
- [ ] Limit Gemini retries to 1 or 0 (prefer immediate fallback)
- [ ] Document rate-limiting strategy (per-user or per-IP)
- [ ] **Warning:** In-memory rate limiting won't work across Vercel instances
- [ ] Optionally implement simple IP-based limiter with caveat documentation
- [ ] Sanitize all AI output (trim reason strings, validate scores)
- [ ] Never log full request bodies, API keys, or tokens
- [ ] Error responses never expose internal details
- [ ] Document residual production risks in deployment checklist

**Test Command:** `npm test -- --grep "security|limit"`

**Files to Create:**
- `src/matching/limiter.js` (optional simple implementation)
- `docs/matching/SECURITY_NOTES.md`

**Files to Modify:**
- `src/matching/controller.js` (add guards)
- `src/matching/validation.js` (candidate count limit)

**Dependencies:** B05 completed  
**Estimated:** 45-60 minutes

---

### B07: Regression, integration and contract tests

**Status:** 🔵 NOT_STARTED  
**Acceptance Criteria:**
- [ ] Test existing OTP routes still work (`/otp/send`, `/otp/verify`)
- [ ] Test existing auth routes (`/password/reset`, `/email/verify`, `/auth/session`)
- [ ] Test `/health` endpoint includes `geminiConfigured` boolean
- [ ] Full integration test for matching endpoint with realistic payload
- [ ] Test edge cases: empty skills, empty projects, no overlap, perfect match
- [ ] Test Gemini mock success and failure paths
- [ ] Test fallback-only mode (no API key)
- [ ] Verify response format matches Flutter contract exactly
- [ ] All tests pass with `npm test`

**Test Command:** `npm test`

**Files to Create:**
- `test/matching.contract.test.js`
- `test/regression.test.js` (OTP, auth routes)

**Dependencies:** B06 completed  
**Estimated:** 45-60 minutes

---

### B08: README, env example, production checklist and final handoff

**Status:** 🔵 NOT_STARTED  
**Acceptance Criteria:**
- [ ] Update `.env.example` with `GEMINI_API_KEY=` and `GEMINI_MODEL=`
- [ ] Update `README.md` matching section (remove "stub" language)
- [ ] Document Firestore `projects` collection schema expectations
- [ ] Create `docs/matching/DEPLOYMENT.md` with Vercel steps
- [ ] List required Vercel environment variables
- [ ] Document model selection and why it was chosen
- [ ] Add production verification checklist
- [ ] Update `AGENT_HANDOFF.md` with final status
- [ ] Verify no secrets in Git history
- [ ] Verify prompt file not in any commit
- [ ] Clean up any temporary test files

**Files to Modify:**
- `.env.example`
- `README.md`

**Files to Create:**
- `docs/matching/DEPLOYMENT.md`
- `docs/matching/FIRESTORE_SCHEMA.md`

**Dependencies:** B07 completed  
**Estimated:** 30-45 minutes

---

## Definition of Done Checklist

- [ ] `POST /matches/generate` returns 200 with valid Flutter contract response
- [ ] Accepts exact Flutter `MatchRequestModel` JSON
- [ ] Returns exact Flutter `MatchResponseModel` JSON
- [ ] Validates requests and rejects invalid input safely
- [ ] Uses Gemini when `GEMINI_API_KEY` is present
- [ ] Structured output is validated and never trusted blindly
- [ ] Fallback gives grounded scores when Gemini unavailable
- [ ] Rate-limit/cost protections implemented or blockers documented
- [ ] Existing OTP, auth, SMTP, Firebase Admin behavior preserved
- [ ] All tests pass (`npm test`)
- [ ] No secrets in Git, prompt file excluded
- [ ] Logical commits for each task
- [ ] `AGENT_HANDOFF.md` updated
- [ ] README and `.env.example` updated

## Critical Notes

1. **Firestore Dependency:** Backend MUST fetch projects from Firestore since Flutter only sends profile
2. **No Auth Yet:** Flutter client doesn't send Firebase ID token; auth is a future enhancement
3. **Rate Limiting:** In-memory won't work on Vercel; needs external store or edge rules
4. **Model Selection:** Use currently supported Gemini Flash-Lite model (verify availability)
5. **32KB Limit:** Already enforced by Express; validate candidate count separately

## Time Estimate

- Total estimated: 5.5 - 7.5 hours
- Target completion: Saturday, 7 November 2026
- Approach: Complete B02-B03 first (fallback working), then B04-B05 (Gemini), then B06-B08 (production readiness)

## Next Action

Start B02: Input validation module and tests.
