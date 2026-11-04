# DevSync Matching Backend — Deployment Guide

**Last updated:** 2026-11-04  
**Target platform:** Vercel  
**Production URL:** `https://devsync-backend-two.vercel.app`

## Prerequisites

1. Vercel account with access to the `devsync-backend` project
2. Google AI Studio account for Gemini API key
3. Firebase project with Admin SDK service account
4. Firestore database with `projects` collection populated

## Local Testing

Before deploying, test locally:

```bash
# Install dependencies
npm ci

# Create .env file
cp .env.example .env

# Add your Gemini API key to .env
GEMINI_API_KEY=your-actual-key-here
GEMINI_MODEL=gemini-2.0-flash-exp

# Add Firebase service account
FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json

# Run tests
npm test

# Start dev server
npm run dev

# Test the endpoint
curl -X POST http://localhost:3000/matches/generate \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "test-user-123",
    "declaredSkills": ["JavaScript", "React"],
    "githubLanguages": {"JavaScript": 5000},
    "publicRepoCount": 10,
    "totalContributions": 500,
    "bio": "Full-stack developer",
    "topRepositories": ["user/repo1"]
  }'
```

Expected response: JSON with `matches` array and `promptVersion`.

## Vercel Environment Variables

Log in to Vercel dashboard and navigate to the project settings:

### Required Variables

1. **`GEMINI_API_KEY`**
   - Get from: https://aistudio.google.com/app/apikey
   - **Important:** Rotate the key if it was previously exposed
   - Scope: Production, Preview, Development (or as needed)
   - Never commit this value to Git

2. **`FIREBASE_SERVICE_ACCOUNT`**
   - Upload the service account JSON content as the value
   - Or provide the file path if using Vercel file storage
   - Scope: Production, Preview, Development

### Optional Variables

3. **`GEMINI_MODEL`**
   - Default: `gemini-2.0-flash-exp`
   - Change if using a different model
   - Verify the model name is supported by Google AI

4. **`SMTP_USER`** and **`SMTP_PASS`**
   - Already configured for OTP emails
   - No changes needed for matching

5. **`PORT`**
   - Vercel auto-assigns; usually not needed
   - Default: 3000

## Deployment Steps

### Option A: Automatic (Git Push)

```bash
# Ensure you're on feature/matching-gemini branch
git branch --show-current

# Push to origin
git push origin feature/matching-gemini

# Vercel will auto-deploy if connected to the repo
```

Vercel will detect the push and deploy automatically if GitHub integration is enabled.

### Option B: Manual (Vercel CLI)

```bash
# Install Vercel CLI if not already installed
npm i -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://devsync-backend-two.vercel.app/health
```

Expected response should include:
```json
{
  "ok": true,
  "service": "devsync-backend",
  "geminiConfigured": true,
  ...
}
```

If `geminiConfigured: false`, check that `GEMINI_API_KEY` is set in Vercel.

### 2. Matching Endpoint Test

```bash
curl -X POST https://devsync-backend-two.vercel.app/matches/generate \
  -H "Content-Type: application/json" \
  -d '{
    "uid": "test-user-123",
    "declaredSkills": ["JavaScript", "React"],
    "githubLanguages": {"JavaScript": 5000},
    "publicRepoCount": 10,
    "totalContributions": 500,
    "bio": "Full-stack developer",
    "topRepositories": ["user/repo1"]
  }'
```

Expected:
- HTTP 200
- JSON response with `matches` array
- Each match has `projectId`, `projectName`, `score`, `reason`, etc.

### 3. Flutter Integration Test

Test from the Flutter app:

```dart
flutter run --dart-define=DEVSYNC_API_BASE=https://devsync-backend-two.vercel.app
```

Navigate to the matching screen and verify:
- Matches load successfully
- Scores and reasons are displayed
- No errors in console

## Firestore Setup

Ensure the `projects` collection exists with documents structured as:

```javascript
{
  title: "Project Name",
  description: "Project description",
  githubUrl: "https://github.com/owner/repo",
  techStack: ["JavaScript", "React", "Node.js"],
  maintainerId: "firebase-user-uid" // Optional
}
```

Alternative field names also supported:
- `name` or `projectName` instead of `title`
- `skills` or `neededSkills` instead of `techStack`
- `github` or `repoUrl` instead of `githubUrl`
- `ownerId` or `owner` instead of `maintainerId`

## Monitoring

### Check Logs

```bash
# Vercel CLI
vercel logs

# Or view in Vercel dashboard
```

Look for:
- `[gemini] Requesting scores from...` — Gemini calls
- `[gemini] Successfully scored N projects` — Success
- `[gemini] Using deterministic fallback scorer` — Fallback mode
- `[projectFetcher] Fetched N projects` — Firestore queries

### Monitor Costs

1. **Gemini API Usage:**
   - Visit https://aistudio.google.com/app/apikey
   - Check usage and quotas
   - Set up billing alerts if available

2. **Vercel Usage:**
   - Dashboard → Usage
   - Monitor function invocations, bandwidth, build minutes

## Troubleshooting

### Issue: `geminiConfigured: false`

**Cause:** `GEMINI_API_KEY` not set or empty in Vercel

**Fix:**
1. Go to Vercel project settings → Environment Variables
2. Add `GEMINI_API_KEY` with your actual key
3. Redeploy or trigger a rebuild

### Issue: Matches always show `isFallback: true`

**Cause:** Gemini is not being used (key missing, model error, or timeout)

**Check:**
1. Verify `GEMINI_API_KEY` is set
2. Check logs for Gemini errors
3. Verify `GEMINI_MODEL` is a supported model name
4. Check Google AI Studio for API key status and quotas

**Temporary:** Fallback still provides meaningful scores based on skill overlap.

### Issue: Empty matches array

**Possible causes:**
1. No projects in Firestore `projects` collection
2. User has no declared skills
3. Firestore query failed

**Fix:**
1. Check Firestore for projects
2. Verify Firebase Admin SDK is configured (`FIREBASE_SERVICE_ACCOUNT`)
3. Check logs for Firestore errors

### Issue: HTTP 500 errors

**Check logs for:**
- Firestore connection errors
- Gemini API errors (shouldn't cause 500, but check logs)
- JavaScript exceptions

**Action:**
- Review recent commits
- Check environment variables are correct
- Verify service account has Firestore read permissions

### Issue: Rate limiting / 429 errors

**From Gemini:** Check API quota and usage limits

**From Vercel:** Check function invocation limits

**Mitigation:** See `docs/matching/SECURITY_NOTES.md` for rate limiting recommendations.

## Rollback

If the deployment has issues:

```bash
# Vercel CLI
vercel rollback

# Or use Vercel dashboard → Deployments → Previous deployment → Promote to Production
```

## Creating a Pull Request

After successful deployment and testing:

```bash
# Ensure all tests pass
npm test

# Push to feature branch
git push origin feature/matching-gemini

# Create PR to master (or main)
# Use GitHub CLI or web UI
gh pr create --base master --head feature/matching-gemini \
  --title "feat(matching): Implement Gemini-powered matching endpoint" \
  --body "Implements POST /matches/generate with Gemini AI scoring and deterministic fallback. See docs/matching/ for details."
```

**PR Checklist:**
- [ ] All tests pass (152 tests)
- [ ] Deployed to Vercel and tested
- [ ] Documentation updated
- [ ] No secrets committed
- [ ] Prompt file not included
- [ ] Security notes reviewed

## Security Reminders

1. **Never commit API keys** — Use environment variables only
2. **Rotate exposed keys immediately** — If a key was previously shared, rotate it
3. **Review security notes** — See `docs/matching/SECURITY_NOTES.md`
4. **Monitor usage** — Set up alerts for unusual patterns
5. **Keep dependencies updated** — Run `npm audit` regularly

## Support

For issues or questions:
- Check logs first (Vercel dashboard or `vercel logs`)
- Review documentation in `docs/matching/`
- Contact project maintainer

---

**Last deployed:** TBD  
**Last verified:** 2026-11-04  
**Next review:** Before public launch
