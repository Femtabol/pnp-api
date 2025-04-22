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
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ message: 'Error fetching users' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;
