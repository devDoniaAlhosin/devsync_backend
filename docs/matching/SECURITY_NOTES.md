# DevSync Matching Backend — Security Notes

**Last updated:** 2026-11-04  
**Status:** Initial implementation

## Active Security Measures

### 1. Input Validation ✅

**Implemented in:** `src/matching/validation.js`

- All request fields validated for type and structure
- Maximum limits enforced:
  - Skills: 100 max
  - Skill length: 100 chars max
  - Bio: 5000 chars max
  - Top repositories: 50 max
  - GitHub languages: 100 max
- JSON size: 32KB max (enforced by Express middleware)
- Sanitization: trim whitespace, filter empty values
- No SQL injection risk (Firestore uses document model)

### 2. Prompt Injection Defense ✅

**Implemented in:** `src/matching/prompt.js`

- All user-provided text (bio, project descriptions) treated as DATA
- Newlines removed from user text to prevent prompt structure manipulation
- Text truncated to reasonable lengths (1000 chars for inline content)
- Explicit instructions to AI model to ignore commands in user data
- Output validation rejects unknown project IDs and malformed scores

### 3. AI Output Sanitization ✅

**Implemented in:** `src/matching/geminiClient.js`, `src/matching/response.js`

- All Gemini responses validated before use
- Score clamping: 0-100 range enforced
- Project ID verification: only IDs from original list accepted
- Duplicate detection: same project cannot appear twice
- Reason text sanitization: trim, truncate, remove newlines
- No arbitrary code execution from AI output

### 4. Error Message Safety ✅

**Implemented in:** Controllers and error handlers

- No stack traces exposed to client
- No internal error details in responses
- No API keys or secrets in error messages
- Generic 500 errors for unexpected failures
- Specific 400 errors for validation issues only

### 5. Secrets Management ✅

**Implemented in:** Environment variables

- `GEMINI_API_KEY` stored in environment only
- Never logged or exposed in responses
- Not committed to Git
- `.env` in `.gitignore`
- `.env.example` contains only placeholders

### 6. Cost Controls ✅

**Implemented in:** Various modules

- Maximum 100 projects per request
- Gemini timeout: 10 seconds
- Gemini temperature: 0.3 (consistent scoring)
- Max output tokens: 2048
- Zero retries on Gemini failures (fail fast to fallback)
- Fallback scoring has no external calls

## Known Limitations & Residual Risks

### 1. ⚠️ No Authentication

**Status:** NOT IMPLEMENTED

**Issue:** Flutter client does not send Firebase ID tokens. Any client can call the endpoint.

**Impact:**
- Cannot attribute costs to specific users
- Cannot enforce per-user rate limits
- Cannot protect against abuse from malicious actors
- Anyone with the API URL can consume Gemini credits

**Mitigation options:**
1. Add Firebase ID token verification (requires Flutter client update - BREAKING CHANGE)
2. Use Vercel Edge Config for anonymous rate limiting
3. Use Vercel WAF/firewall rules
4. Monitor usage and implement IP blocking manually

**Recommended:** Plan authentication as v2 feature; coordinate with Flutter team.

### 2. ⚠️ No Effective Rate Limiting

**Status:** NOT IMPLEMENTED (Vercel serverless constraint)

**Issue:** In-memory rate limiting won't work across Vercel serverless instances.

**Impact:**
- Single IP can make unlimited requests
- Same user can exhaust API quotas
- No protection against DoS or cost attacks

**Why not implemented:**
- Simple in-memory counters don't persist across cold starts
- Each serverless invocation is independent
- No shared state between instances
- Requires external store (Redis, Vercel KV, edge config, etc.)

**Mitigation options:**
1. **Vercel KV** (Redis): Track requests per IP/user with TTL
2. **Vercel Edge Config**: Global limits updated near-realtime
3. **Upstash Redis**: Serverless-friendly rate limiting
4. **Platform-level protection**: Vercel firewall, Cloudflare WAF
5. **Gemini API limits**: Rely on Google's built-in quotas (weak protection)

**Temporary measure:** Monitor Vercel logs and Gemini usage; manually block abusive IPs if detected.

**Recommended:** Implement proper rate limiting before public launch.

### 3. ⚠️ Firestore Security Rules

**Status:** OUT OF SCOPE for backend

**Issue:** Backend uses Firebase Admin SDK, which bypasses Firestore security rules. Backend code is trusted, but if compromised, full database access is available.

**Impact:**
- Backend can read/write any Firestore document
- If service account key leaks, full database access exposed

**Mitigation:**
- Never commit service account JSON
- Rotate service account keys regularly
- Use minimal permission service accounts
- Monitor Admin SDK usage
- Keep backend code secure and reviewed

### 4. ⚠️ No Request Signing

**Status:** NOT IMPLEMENTED

**Issue:** No HMAC or signed requests to prevent request tampering.

**Impact:**
- Requests can be intercepted and modified (mitigated by HTTPS)
- No integrity verification

**Mitigation:**
- HTTPS encrypts traffic in transit
- Not critical for initial launch (requests are read-only profile data)

### 5. ⚠️ CORS Configuration

**Status:** WIDE OPEN (`cors()` with no restrictions)

**Issue:** Any origin can call the API.

**Impact:**
- Browser-based attacks possible if secrets exposed
- Cannot prevent unauthorized web apps from using API

**Mitigation options:**
- Restrict CORS to known Flutter web domains
- Use origin allowlist in production
- Not critical for mobile apps (CORS is browser-only)

**Recommended:** Restrict CORS before production web deployment.

### 6. ⚠️ Logging and Monitoring

**Status:** BASIC (console.log only)

**Issue:** No structured logging, monitoring, or alerting.

**Impact:**
- Hard to detect abuse or unusual patterns
- Cannot track API usage trends
- Limited debugging for production issues

**Recommended:**
- Add structured logging (JSON format)
- Send logs to monitoring service (Datadog, Sentry, LogRocket)
- Set up alerts for high error rates or unusual usage

## Production Deployment Checklist

Before deploying to production with real traffic:

### Critical (Must Have)

- [ ] Verify `.env` contains rotated `GEMINI_API_KEY` (not exposed key)
- [ ] Ensure service account JSON is secure (not in Git, not in logs)
- [ ] Set `GEMINI_MODEL` to actual supported model
- [ ] Test endpoint with realistic Flutter request payload
- [ ] Verify fallback works when `GEMINI_API_KEY` is missing
- [ ] Confirm Firestore `projects` collection has data
- [ ] Test `/health` endpoint returns correct `geminiConfigured` status

### Important (Should Have)

- [ ] Implement rate limiting (Vercel KV, Upstash, or edge config)
- [ ] Add structured logging and monitoring
- [ ] Restrict CORS to known origins
- [ ] Set up Gemini API usage alerts
- [ ] Test with actual Flutter app end-to-end
- [ ] Document Vercel environment variable setup

### Nice to Have (Future)

- [ ] Add Firebase ID token authentication
- [ ] Implement per-user rate limits
- [ ] Add request/response logging for debugging
- [ ] Set up Sentry or error tracking
- [ ] Add performance monitoring
- [ ] Create admin dashboard for usage metrics

## Security Incidents

**If Gemini API key is exposed:**
1. Rotate the key immediately in Google AI Studio / Cloud Console
2. Update Vercel environment variable with new key
3. Redeploy or restart functions
4. Monitor usage for unauthorized calls
5. Review access logs if available

**If service account key is exposed:**
1. Revoke the key in Firebase Console → Project Settings → Service Accounts
2. Generate new service account key
3. Update environment variable with new key path/JSON
4. Redeploy
5. Check Firestore audit logs for unauthorized access

## Contact

For security concerns or to report vulnerabilities, contact the project maintainer.

---

**Last security review:** 2026-11-04  
**Next review due:** Before production launch
