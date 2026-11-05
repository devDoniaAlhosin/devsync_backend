# Matching checkpoint

Branch: feature/matching-gemini. Backend increment complete locally.
Validated POST candidates (max 20) additive to frozen flat profile contract;
legacy requests without projects still use existing server Firestore loader.
Firebase bearer token required and UID checked at route boundary. Per-instance
6/min/user, 4 concurrent; production Vercel firewall/shared quotas still required.
SDK timeout 4s, no retries, structured JSON, omitted candidates use deterministic
fallback. Default model gemini-3.1-flash-lite; GEMINI_MODEL remains overridable.
Official reference: https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite
No declared skills => no matches, including when GitHub languages exist.
Verification: npm test, 158 passed; all model calls mocked; no live API invoked.
No secrets inspected/changed; unrelated FLUTTER_TESTING_GUIDE.md excluded.
Next: Flutter Firestore profile/candidate reads and authenticated HTTP integration.
Deploy requires private Firebase Admin/Gemini configuration and shared rate limits.

Final backend verification: npm test => 158 passed, zero failed. Legacy server-fetched candidates are now also capped at 20. Previous implementation commit: 2c5f511. No deploy/push/live Gemini verification performed. Flutter work and final smoke checks continue in the sibling repository.
