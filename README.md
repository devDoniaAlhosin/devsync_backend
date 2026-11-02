# DevSync backend (OTP + later Gemini)

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
- Brand files live in `public/brand/` (copied from the app’s `assets/brand`). The API page and OTP emails use those logos.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/otp/send` | `{ email, purpose?: "verify" \| "reset" \| "signin" }` |
| POST | `/otp/verify` | `{ email, code, purpose? }` |
| POST | `/password/reset` | `{ email, code, newPassword }` |
| POST | `/email/verify` | `{ email, code }` |
| POST | `/auth/session` | `{ email, code }` → `{ ok, customToken }` (consumes purpose `signin` OTP) |
| POST | `/matches/generate` | Stub for Emad (Gemini later) — matching HTTP is this POST only |

**Why `POST /auth/session`?** Passwordless sign-in with a code cannot use Firebase Auth’s normal email/password APIs with only an OTP. This route verifies the `signin` OTP, uses the Admin SDK to find or create the user, mints a **Firebase custom token**, and returns `{ ok, customToken }`. Flutter then calls `signInWithCustomToken` so Firebase issues a real Auth session. Minting custom tokens requires a service account and must stay on this server — never in the Flutter app.

## For Emad — matching

`POST /matches/generate` stays a stub on `master` until Gemini Flash-Lite is implemented. Hold `GEMINI_API_KEY` only in this repo’s env / Vercel secrets — never in the Flutter app. Branch off a fresh copy of `master` when you start that work.
