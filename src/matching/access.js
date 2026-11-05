const { getAdmin } = require('../firebaseAdmin');

// Per-instance burst protection. Production must also configure Vercel's shared
// firewall/rate limit: this map is not a cross-instance quota.
function createMatchingAccess({ admin = getAdmin, now = Date.now } = {}) {
  const requests = new Map();
  let active = 0;
  return async (req, res, next) => {
    const token = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    if (!token) return res.status(401).json({ error: 'Sign in to generate matches' });
    let sdk;
    try { sdk = admin(); } catch { /* Missing server configuration. */ }
    if (!sdk) return res.status(503).json({ error: 'Authentication is unavailable' });
    let identity;
    try { identity = await sdk.auth().verifyIdToken(token); }
    catch { return res.status(401).json({ error: 'Your session has expired' }); }
    if (identity.uid !== req.body?.uid) {
      return res.status(403).json({ error: 'Profile does not belong to this session' });
    }
    const time = now();
    for (const [uid, window] of requests) {
      if (time - window.started >= 60000) requests.delete(uid);
    }
    const window = requests.get(identity.uid) || { started: time, count: 0 };
    if (window.count >= 6 || active >= 4 || requests.size >= 10000) {
      res.set('Retry-After', '60');
      return res.status(429).json({ error: 'Please wait before generating more matches' });
    }
    window.count++;
    requests.set(identity.uid, window);
    active++;
    let released = false;
    const release = () => { if (!released) { active--; released = true; } };
    res.once('finish', release);
    res.once('close', release);
    next();
  };
}

module.exports = { createMatchingAccess };
