const express = require('express');
const authenticateToken = require('../middleware/auth');
const isAdmin = require('../middleware/admin');
const pool = require('../config/database');

const router = express.Router();

// Get all users (Admin only)
router.get('/users', authenticateToken, isAdmin, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const users = await conn.query('SELECT id, name, email, subscription, tokens_per_day, tokens_remaining, tokens_used, active, registered_date FROM users');
    res.json(users);
    console.log('Fetched users:', users);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Error fetching users' });
  } finally {
    if (conn) conn.release();
  }
});

router.put('/users/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, email, subscription, active } = req.body;

  if (!name || !email || !subscription) {
    return res.status(400).json({ message: 'Name, email, and subscription are required' });
  }

  // Find the subscription plan to get the token limit
  const tokenPlans = require('../utils/tokenPlans');
  const plan = tokenPlans.find(p => p.name === subscription);

  if (!plan) {
    return res.status(400).json({ message: 'Invalid subscription plan' });
  }

  const tokensPerDay = plan.value;

  // Calculate expiration date (e.g., 30 days for monthly plans)
  let subscriptionExpiresAt = null;
  if (subscription === 'monthly') {
    subscriptionExpiresAt = new Date();
    subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 1);
  } else if (subscription === 'six_month') {
    subscriptionExpiresAt = new Date();
    subscriptionExpiresAt.setMonth(subscriptionExpiresAt.getMonth() + 6);
  } else if (subscription === 'annual') {
    subscriptionExpiresAt = new Date();
    subscriptionExpiresAt.setFullYear(subscriptionExpiresAt.getFullYear() + 1);
  } else if (subscription === 'lifetime') {
    subscriptionExpiresAt = null; // Lifetime plans don't expire
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const [user] = await conn.query('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update user details and reset tokens_remaining to the plan's token limit
    await conn.query(
      'UPDATE users SET name = ?, email = ?, subscription = ?, active = ?, tokens_per_day = ?, tokens_remaining = ?, subscription_expires_at = ? WHERE id = ?',
      [name, email, subscription, 1, tokensPerDay, tokensPerDay, subscriptionExpiresAt, id]
    );

    res.json({ message: 'User updated successfully', tokensPerDay, tokensRemaining: tokensPerDay });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ message: 'Failed to update user' });
  } finally {
    if (conn) conn.release();
  }
});

router.delete('/users/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();

    const [user] = await conn.query('SELECT id FROM users WHERE id = ?', [id]);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await conn.query('DELETE FROM users WHERE id = ?', [id]);

    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ message: 'Failed to delete user' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
