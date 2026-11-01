# DevSync backend (OTP + later Gemini)

Sibling of the Flutter app. Stays off Firebase Cloud Functions so the Firebase project can remain on Spark.

## Run locally

```bash
cp .env.example .env
npm install
npm run dev
```

- Without `SMTP_USER` / `SMTP_PASS`, codes print in the terminal (dev only).
- Put a Firebase service-account JSON path in `FIREBASE_SERVICE_ACCOUNT` so `/password/reset` and `/email/verify` can update Auth.
- Flutter default: `http://127.0.0.1:3000` (Android emulator: `http://10.0.2.2:3000`).

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/otp/send` | `{ email, purpose?: "verify" \| "reset" }` |
| POST | `/otp/verify` | `{ email, code, purpose? }` |
| POST | `/password/reset` | `{ email, code, newPassword }` |
| POST | `/email/verify` | `{ email, code }` |
| POST | `/matches/generate` | Stub for Emad (Gemini later) |
