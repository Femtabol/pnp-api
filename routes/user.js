const express = require('express');
const authenticateToken = require('../middleware/auth');
const pool = require('../config/database');
const tokenPlans = require('../utils/tokenPlans');
const { WEBHOOK_EVENTS, sendWebhook } = require('../utils/webhooks');

const router = express.Router();

// Get current user (safe response)
router.get('/me', authenticateToken, (req, res) => {
  const { password, ...safeUser } = req.user;
  res.json(safeUser);
});

// Update subscription plan
router.post('/update-subscription', authenticateToken, async (req, res) => {
  const { planId } = req.body;
  const tokensPerDay = tokenPlans[planId];

  if (tokensPerDay === undefined) {
    return res.status(400).json({ message: 'Invalid plan ID' });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const [userBefore] = await conn.query(
      'SELECT subscription FROM users WHERE id = ?',
      [req.user.id]
    );

    await conn.query(
      `UPDATE users SET subscription = ?, tokens_per_day = ?, tokens_remaining = ? WHERE id = ?`,
      [planId, tokensPerDay, tokensPerDay, req.user.id]
    );

    // Trigger webhook for subscription update
    sendWebhook(WEBHOOK_EVENTS.SUBSCRIPTION_UPDATED, {
      userId: req.user.id,
      email: req.user.email,
      name: req.user.name,
      oldSubscription: userBefore.subscription,
      newSubscription: planId,
      tokensPerDay
    });

    res.json({
      message: 'Subscription updated',
      subscription: planId,
      tokensPerDay,
      tokensRemaining: tokensPerDay
    });
  } catch (err) {
    console.error('Error updating subscription:', err);
    res.status(500).json({ message: 'Failed to update subscription' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;