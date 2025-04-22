const express = require('express');
const authenticateToken = require('../middleware/auth');
const pool = require('../config/database');
const tokenPlans = require('../utils/tokenPlans');

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

    await conn.query(
      `UPDATE users SET subscription = ?, tokens_per_day = ?, tokens_remaining = ? WHERE id = ?`,
      [planId, tokensPerDay, tokensPerDay, req.user.id]
    );

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
