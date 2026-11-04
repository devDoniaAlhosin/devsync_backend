# DevSync backend (OTP + Gemini Matching)

Sibling of the Flutter app. Stays off Firebase Cloud Functions so the Firebase project can remain on Spark.

## Production

| | |
|---|---|
| **Base URL** | [`https://devsync-backend-two.vercel.app`](https://devsync-backend-two.vercel.app) |
| **Status page** | Same host — health, SMTP, Firebase Admin, endpoint table |

Flutter defaults to this host in `AuthEmailApi` (`DEVSYNC_API_BASE` / `_hostedBase`). Override with:

```bash
flutter run --dart-define=DEVSYNC_API_BASE=https://devsync-backend-two.vercel.app
```

Use `--dart-define=DEVSYNC_API_LOCAL=true` to hit local `npm run dev` instead (emulator: `http://10.0.2.2:3000`).

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

- Without `SMTP_USER` / `SMTP_PASS`, codes print in the terminal (dev only).
- Put a Firebase service-account JSON path in `FIREBASE_SERVICE_ACCOUNT` so `/password/reset`, `/email/verify`, and `/auth/session` can use the Admin SDK.
- Flutter local: `http://127.0.0.1:3000` (Android emulator: `http://10.0.2.2:3000`).
- Brand files live in `public/brand/` (copied from the app's `assets/brand`). The API page and OTP emails use those logos.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/otp/send` | `{ email, purpose?: "verify" \| "reset" \| "signin" }` |
| POST | `/otp/verify` | `{ email, code, purpose? }` |
| POST | `/password/reset` | `{ email, code, newPassword }` |
| POST | `/email/verify` | `{ email, code }` |
| POST | `/auth/session` | `{ email, code }` → `{ ok, customToken }` (consumes purpose `signin` OTP) |
| POST | `/matches/generate` | AI-powered matching (Gemini + fallback) — see `docs/matching/` |

**Why `POST /auth/session`?** Passwordless sign-in with a code cannot use Firebase Auth's normal email/password APIs with only an OTP. This route verifies the `signin` OTP, uses the Admin SDK to find or create the user, mints a **Firebase custom token**, and returns `{ ok, customToken }`. Flutter then calls `signInWithCustomToken` so Firebase issues a real Auth session. Minting custom tokens requires a service account and must stay on this server — never in the Flutter app.

## Matching - Gemini AI Scoring

`POST /matches/generate` accepts a developer profile and returns AI-scored project matches.

**Status:** ✅ **Implemented** (Gemini Flash + deterministic fallback)

**Documentation:**
- API contract: `docs/matching/CONTRACT.md`
- Implementation plan: `docs/matching/IMPLEMENTATION_PLAN.md`
- Security notes: `docs/matching/SECURITY_NOTES.md`
- Agent handoff: `docs/matching/AGENT_HANDOFF.md`

**Environment variables:**
- `GEMINI_API_KEY` — Google AI API key (required for AI scoring)
- `GEMINI_MODEL` — Model name (default: `gemini-2.0-flash-exp`)

**Behavior:**
- When `GEMINI_API_KEY` is set: Uses Gemini for intelligent scoring
- When key is missing or Gemini fails: Uses deterministic skill-based fallback
- Empty skills → returns empty matches list
- No projects in Firestore → returns empty matches list

**Setup:**
1. Get Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Add to `.env`: `GEMINI_API_KEY=your-key-here`
3. (Optional) Set `GEMINI_MODEL` to use a different model
4. Ensure Firestore has projects in the `projects` collection
5. Test: `npm test` (152 tests should pass)

**Never commit the API key.** Hold `GEMINI_API_KEY` only in this repo's env / Vercel secrets — never in the Flutter app.
