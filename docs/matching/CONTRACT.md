# DevSync Matching API Contract

**Last verified:** 2026-11-04  
**Flutter branch:** `feature/matching` (commits 7b8c165, 926f55d, a0b777c)  
**Backend branch:** `feature/matching-gemini`

## Source Files Verified

- `lib/features/matching/data/models/match_request_model.dart`
- `lib/features/matching/data/models/match_response_model.dart`
- `lib/features/matching/data/models/match_item_model.dart`
- `lib/features/matching/data/datasources/matching_http_remote_data_source.dart`
- `lib/features/matching/data/repositories/matching_repository_impl.dart`

## HTTP Endpoint

```
POST /matches/generate
Content-Type: application/json
```

## Request Format

**Verified from `MatchRequestModel.toJson()`:**

```json
{
  "uid": "string (Firebase UID)",
  "declaredSkills": ["string", "..."],
  "githubLanguages": {
    "JavaScript": 5420,
    "Python": 3200
  },
  "publicRepoCount": 12,
  "totalContributions": 847,
  "bio": "string or null (optional field)",
  "topRepositories": ["owner/repo", "..."]
}
```

### Field Details

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `uid` | string | Yes | Firebase user ID |
| `declaredSkills` | string[] | Yes | User's self-declared skills |
| `githubLanguages` | object | Yes | Map of language name to byte count from GitHub |
| `publicRepoCount` | number | Yes | GitHub public repository count |
| `totalContributions` | number | Yes | GitHub contribution count |
| `bio` | string \| null | No | User's bio text (omitted from JSON if null) |
| `topRepositories` | string[] | Yes | List of top repository names in "owner/repo" format |

### ⚠️ CRITICAL CONTRACT GAP

**The prompt states:** "backend receives the developer profile and candidate projects in the POST body"

**The actual Flutter code:** Only sends the developer profile (`MatchRequestModel.fromProfile(profile)`)

**Missing:** No candidate projects/project list is included in the request body.

**Resolution options:**
1. Backend fetches all projects from Firestore `projects` collection
2. Flutter contract needs to be expanded to include candidate projects
3. Backend uses a hardcoded/filtered project query

**Decision:** Backend will fetch candidate projects from Firestore since:
- Firebase Admin SDK is already configured
- Flutter app uses Firestore for project data
- Keeps the client request lightweight
- Backend can implement filtering/pagination efficiently

## Response Format

**Verified from `MatchResponseModel.fromJson()` and `MatchItemModel.fromJson()`:**

```json
{
  "matches": [
    {
      "projectId": "string (Firestore doc ID)",
      "projectName": "string",
      "description": "string (can be empty)",
      "githubUrl": "string (can be empty)",
      "neededSkills": ["string", "..."],
      "score": 0.0,
      "reason": "string (can be empty)",
      "maintainerId": "string or null (optional)",
      "isFallback": false
    }
  ],
  "promptVersion": "string (defaults to 'unknown' if missing)"
}
```

### Field Details

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `matches` | array | Yes | Array of match items, sorted by score descending |
| `matches[].projectId` | string | Yes | Firestore document ID |
| `matches[].projectName` | string | Yes | Display name |
| `matches[].description` | string | Yes | Can be empty string |
| `matches[].githubUrl` | string | Yes | Can be empty string |
| `matches[].neededSkills` | string[] | Yes | Required skills for the project |
| `matches[].score` | number | Yes | Fit score 0-100 (stored as double) |
| `matches[].reason` | string | Yes | AI/fallback explanation, can be empty |
| `matches[].maintainerId` | string \| null | No | Omitted from JSON if null |
| `matches[].isFallback` | boolean | No | Defaults to false if missing |
| `promptVersion` | string | No | Defaults to "unknown" if missing |

### Important Response Behaviors

1. **No wrapper:** Response is a direct object, not wrapped in `{ok: true, data: ...}`
2. **Sorting:** Matches MUST be sorted by score in descending order
3. **Empty results:** Return `{"matches": [], "promptVersion": "v1"}` for valid requests with no matches
4. **Score range:** Score must be numeric 0-100 (Flutter parses as `double`)
5. **Duplicate project IDs:** Backend must deduplicate; never return same project twice
6. **Unknown project IDs:** AI output must only reference projects from the original candidate set
7. **Missing fields:** Optional fields (`maintainerId`, `isFallback`, `bio`) can be omitted; Flutter handles defaults

## Error Responses

**Verified from `MatchingHttpRemoteDataSource` error handling:**

For 4xx/5xx responses, client expects:

```json
{
  "error": "Human-readable error message"
}
```

If the `error` field is missing, Flutter falls back to generic "Matching request failed".

### Error Codes

| Status | Meaning | Example |
|--------|---------|---------|
| 400 | Invalid request | Missing required fields, malformed JSON |
| 429 | Rate limited | Too many requests from user/IP |
| 500 | Server error | Internal error, use fallback scoring |
| 502 | Upstream failure | Gemini API error, use fallback |
| 503 | Service unavailable | Firebase not configured |

**Security:** Never expose internal errors, API keys, prompts, or PII in error messages.

## Authentication

**Current Status:** No Firebase ID token is sent in the Flutter HTTP client.

The `MatchingHttpRemoteDataSource` does not add any `Authorization` header. If auth protection is needed, this will be a **breaking change** requiring Flutter coordination.

**Recommendation:** Implement optional rate limiting without requiring auth in v1, plan auth for v2.

## Success Response Example

```json
{
  "matches": [
    {
      "projectId": "abc123xyz",
      "projectName": "flutter/packages",
      "description": "Useful Dart packages maintained by the Flutter team",
      "githubUrl": "https://github.com/flutter/packages",
      "neededSkills": ["Dart", "Flutter", "Testing"],
      "score": 92.5,
      "reason": "Strong match: you have Dart and Flutter skills, and your GitHub shows Flutter contributions",
      "maintainerId": "user_firebase_uid_here",
      "isFallback": false
    },
    {
      "projectId": "def456uvw",
      "projectName": "nodejs/node",
      "description": "Node.js JavaScript runtime",
      "githubUrl": "https://github.com/nodejs/node",
      "neededSkills": ["JavaScript", "C++", "Node.js"],
      "score": 78.0,
      "reason": "Moderate match: JavaScript experience present, but no C++ background",
      "isFallback": false
    }
  ],
  "promptVersion": "v1.0"
}
```

## Contract Verification Status

✅ Request structure verified from Dart serialization  
✅ Response structure verified from Dart deserialization  
✅ Error handling verified from data source implementation  
⚠️ **Candidate projects source unverified** - Backend will fetch from Firestore  
❌ Authentication not implemented in Flutter client  
❌ No test fixtures found with full request/response examples  

## Next Steps

1. Implement backend Firestore project fetch (filter by status, limit count)
2. Define Firestore `projects` collection schema expectations
3. Add validation for max candidate count (token budget constraint)
4. Implement deterministic fallback using fetched projects
5. Integrate Gemini with fetched project data

## 2026-11-05 client integration
POST requires Authorization: Bearer <Firebase ID token>; uid must match. Optional projects contains up to 20 candidates with projectId, projectName, description, githubUrl, neededSkills and optional maintainerId. Flutter obtains these via Firestore client rules. Optional prompt (1000 chars) and tags are preferences, never claimed skills. No declared skills returns no matches. 401/403/429/503 are explicit failures. Shared Vercel rate limiting must complement instance burst protection.
