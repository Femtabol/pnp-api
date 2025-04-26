BigInt.prototype.toJSON = function () {
    return this.toString();
};
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
app.use('/api/plans', require('./routes/plans'));


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

// cron for checking user subscription expiry
cron.schedule('0 0 * * *', async () => {
  console.log('Running subscription expiry check...');
  let conn;
  try {
    conn = await pool.getConnection();

    // Find users with expired subscriptions
    const expiredUsers = await conn.query(
      'SELECT id FROM users WHERE subscription_expires_at IS NOT NULL AND subscription_expires_at < NOW()'
    );

    if (expiredUsers.length > 0) {
      const userIds = expiredUsers.map(user => user.id);

      // Roll back expired subscriptions to "free"
      await conn.query(
        'UPDATE users SET subscription = "free", tokens_per_day = 0, tokens_remaining = 0, subscription_expires_at = NULL WHERE id IN (?)',
        [userIds]
      );

      console.log(`Rolled back ${userIds.length} expired subscriptions to "free".`);
    } else {
      console.log('No expired subscriptions found.');
    }
  } catch (err) {
    console.error('Error during subscription expiry check:', err);
  } finally {
    if (conn) conn.release();
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});