const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Add axios for webhook handling
const axios = require('axios');

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/user'));
app.use('/api', require('./routes/download'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/webhooks', require('./routes/webhooks'));
app.use('/api/webhook-test', require('./routes/webhook-test'));

// Daily token refresh
const pool = require('./config/database');
cron.schedule('0 0 * * *', async () => {
  try {
    const conn = await pool.getConnection();
    const settings = await conn.query("SELECT value FROM settings WHERE key_name = 'auto_refresh_tokens'");
    if (settings.length && settings[0].value === 'true') {
      await conn.query('UPDATE users SET tokens_remaining = tokens_per_day');
      console.log('Tokens refreshed for all users');
    }
    conn.release();
  } catch (err) {
    console.error('Scheduled task failed', err);
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});