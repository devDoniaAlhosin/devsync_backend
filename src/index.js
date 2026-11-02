require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const routes = require('./routes');
const { hasSmtp } = require('./mailer');
const { getAdmin } = require('./firebaseAdmin');

const app = express();
const port = Number(process.env.PORT || 3000);
const startedAt = Date.now();

app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/health', (_req, res) => {
  let firebaseAdminConfigured = false;
  try {
    firebaseAdminConfigured = Boolean(getAdmin());
  } catch (_) {
    firebaseAdminConfigured = false;
  }

  res.json({
    ok: true,
    service: 'devsync-backend',
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    smtpConfigured: hasSmtp(),
    firebaseAdminConfigured,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

app.use(routes);

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(port, '0.0.0.0', () => {
    console.log(`devsync-backend listening on http://127.0.0.1:${port}`);
  });
}

module.exports = app;
