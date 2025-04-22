const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const { WEBHOOK_EVENTS, sendWebhook } = require('../utils/webhooks');
const tokenPlans = require('../utils/tokenPlans');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Default subscription for new users
const DEFAULT_SUBSCRIPTION = 'free';

// Register user
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ message: 'Missing fields' });

  let conn;
  try {
    conn = await pool.getConnection();
    const [existing] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) return res.status(400).json({ message: 'Email is already in use' });

    // Use the default subscription
    const subscriptionValue = DEFAULT_SUBSCRIPTION;
    
    // Get tokens for this subscription - explicitly check for 'free' to ensure 0 tokens
    const tokensPerDay = subscriptionValue === 'free' ? 0 : (tokenPlans[subscriptionValue] || 0);
    const tokensRemaining = tokensPerDay; // This will be 0 for free tier

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const result = await conn.query(
      'INSERT INTO users (name, email, password, subscription, tokens_per_day, tokens_remaining) VALUES (?, ?, ?, ?, ?, ?)',
      [name, email, hashedPassword, subscriptionValue, tokensPerDay, tokensRemaining]
    );
    
    const userId = result.insertId;
    // Convert BigInt to Number if needed
    const userIdNumber = typeof userId === 'bigint' ? Number(userId) : userId;

    const token = jwt.sign({ id: userIdNumber }, JWT_SECRET, { expiresIn: '7d' });
    
    // Trigger webhook for user registration
    sendWebhook(WEBHOOK_EVENTS.USER_REGISTERED, {
      userId: userIdNumber,
      name,
      email,
      subscription: subscriptionValue
    });
    
    res.status(201).json({ 
      message: 'Registration successful', 
      token,
      user: {
        id: userIdNumber,
        name,
        email,
        subscription: subscriptionValue,
        tokensPerDay,
        tokensRemaining 
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ message: 'Registration failed' });
  } finally {
    if (conn) conn.release();
  }
});

// Login user
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ message: 'Missing fields' });

  let conn;
  try {
    conn = await pool.getConnection();
    const [user] = await conn.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!user || !user.active) return res.status(401).json({ message: 'Invalid credentials' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: 'Invalid credentials' });

    // Convert BigInt to Number if needed
    const userId = typeof user.id === 'bigint' ? Number(user.id) : user.id;
    
    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '7d' });
    
    // Trigger webhook for user login
    sendWebhook(WEBHOOK_EVENTS.USER_LOGIN, {
      userId: userId,
      email: user.email,
      name: user.name,
      subscription: user.subscription
    });
    
    res.json({ 
      message: 'Login successful', 
      token,
      user: {
        id: userId,
        name: user.name,
        email: user.email,
        subscription: user.subscription,
        tokensPerDay: user.tokens_per_day,
        tokensRemaining: user.tokens_remaining
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;