const express = require('express');
const authenticateToken = require('../middleware/auth');
const pool = require('../config/database');
const { WEBHOOK_EVENTS, sendWebhook } = require('../utils/webhooks');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Add axios for external file fetching

const router = express.Router();

// Get all files
router.get('/files', authenticateToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();

    // Updated to include has_drm and drm_name fields
    const filesResult = await conn.query(
      'SELECT id, title, created_at, file_url, has_drm, drm_name FROM files'
    );

    // Convert any BigInt values to Numbers
    const files = filesResult.map(file => {
      const processed = {};
      for (const [key, value] of Object.entries(file)) {
        processed[key] = typeof value === 'bigint' ? Number(value) : value;
      }
      return processed;
    });

    res.json(files);
  } catch (err) {
    console.error('Error fetching files:', err);
    res.status(500).json({ message: 'Failed to retrieve files' });
  } finally {
    if (conn) conn.release();
  }
});

// Validate the Download Key Before Serving the File
router.get('/downloads/:downloadKey', async (req, res) => {
  const { downloadKey } = req.params;

  let conn;
  try {
    conn = await pool.getConnection();

    // Validate the download key
    const [keyRow] = await conn.query(
      'SELECT dk.file_id, f.file_url, dk.used, dk.expires_at FROM download_keys dk JOIN files f ON dk.file_id = f.id WHERE dk.download_key = ?',
      [downloadKey]
    );

    if (!keyRow) {
      return res.status(404).json({ message: 'Invalid or expired download key' });
    }

    if (keyRow.used) {
      return res.status(403).json({ message: 'This download key has already been used' });
    }

    if (new Date(keyRow.expires_at) < new Date()) {
      return res.status(403).json({ message: 'This download key has expired' });
    }

    // Mark the key as used
    await conn.query('UPDATE download_keys SET used = TRUE WHERE download_key = ?', [downloadKey]);

    // Fetch the file from the external URL
    const fileUrl = keyRow.file_url; // URL stored in the database
    const fileName = path.basename(fileUrl); // Extract the file name from the URL

    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream', // Stream the file content
    });

    // Set headers and pipe the file to the client
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    response.data.pipe(res);
  } catch (err) {
    console.error('Error validating download key or fetching file:', err);
    res.status(500).json({ message: 'Internal server error' });
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

    // Fetch user tokens and file details
    const [userRow] = await conn.query(
      'SELECT tokens_remaining, tokens_per_day FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!userRow || userRow.tokens_remaining <= 0) {
      return res.status(403).json({ message: 'No tokens remaining for today' });
    }

    const [fileRow] = await conn.query(
      'SELECT id, title, file_url FROM files WHERE id = ?',
      [fileId]
    );

    if (!fileRow) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Begin transaction
    await conn.beginTransaction();

    // Deduct token
    await conn.query(
      'UPDATE users SET tokens_remaining = tokens_remaining - 1, tokens_used = tokens_used + 1 WHERE id = ?',
      [req.user.id]
    );

    // Generate a unique download key
    const downloadKey = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // Key expires in 15 minutes

    await conn.query(
      'INSERT INTO download_keys (user_id, file_id, download_key, expires_at) VALUES (?, ?, ?, ?)',
      [req.user.id, fileId, downloadKey, expiresAt]
    );

    await conn.commit();

    res.json({
      message: 'Token used successfully',
      downloadKey,
      expiresAt,
      fileName: fileRow.title
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