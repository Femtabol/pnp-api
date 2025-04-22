const express = require('express');
const authenticateToken = require('../middleware/auth');
const pool = require('../config/database');
const { WEBHOOK_EVENTS, sendWebhook } = require('../utils/webhooks');

const router = express.Router();

// Get all files
router.get('/files', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // Select only safe public fields (title, created_at, file_url)
    const files = await conn.query(
      'SELECT id, title, created_at, file_url FROM files'
    );

    res.json(files);
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ message: 'Failed to retrieve files' });
  } finally {
    if (conn) conn.release();
  }
});

// Use token for a download
router.post('/downloads/use-token', authenticateToken, async (req, res) => {
  const { fileId } = req.body;

  if (!fileId || isNaN(fileId)) {
    return res.status(400).json({ message: 'Valid File ID is required' });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    // Fetch latest user tokens from the database
    const [userRow] = await conn.query(
      'SELECT tokens_remaining, tokens_per_day FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!userRow) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (userRow.tokens_remaining <= 0) {
      return res.status(403).json({ message: 'No tokens remaining for today' });
    }

    // Check if the file exists
    const [fileRow] = await conn.query(
      'SELECT id, title, file_url FROM files WHERE id = ?',
      [fileId]
    );

    if (!fileRow) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Begin transaction: deduct token + log download
    await conn.beginTransaction();

    // Deduct token and increment tokens used
    await conn.query(
      'UPDATE users SET tokens_remaining = tokens_remaining - 1, tokens_used = tokens_used + 1 WHERE id = ?',
      [req.user.id]
    );

    // Log the download
    const downloadResult = await conn.query(
      'INSERT INTO downloads (user_id, file_id) VALUES (?, ?)',
      [req.user.id, fileId]
    );

    await conn.commit();

    // Trigger webhook for token usage
    sendWebhook(WEBHOOK_EVENTS.TOKEN_USED, {
      userId: req.user.id,
      email: req.user.email,
      name: req.user.name,
      fileId: fileId,
      fileName: fileRow.title,
      downloadId: downloadResult.insertId,
      tokensRemaining: userRow.tokens_remaining - 1,
      tokensPerDay: userRow.tokens_per_day
    });

    res.json({
      message: 'Token used successfully',
      downloadUrl: `/api/download/${fileId}`,
      fileName: fileRow.title,
      tokensRemaining: userRow.tokens_remaining - 1,
      fileUrl: fileRow.file_url  // Including file URL in the response
    });

  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Error during token usage:', err);
    res.status(500).json({ message: 'Download error' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;