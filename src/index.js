require('dotenv').config();

const express = require('express');
const cors = require('cors');
const routes = require('./routes');

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ ok: true, service: 'devsync-backend' }));
app.use(routes);

app.listen(port, '0.0.0.0', () => {
  console.log(`devsync-backend listening on http://127.0.0.1:${port}`);
});
