const express = require('express');
const crypto = require('crypto');
const pool = require('../config/database');

const router = express.Router();

// This is a test endpoint that can receive webhooks for testing
router.post('/receive', async (req, res) => {
  const { event, timestamp, data } = req.body;
  
  console.log('📣 Webhook received:');
  console.log(`Event: ${event}`);
  console.log(`Timestamp: ${timestamp}`);
  console.log('Data:', data);
  
  // Save received webhook to database for inspection
  let conn;
  try {
    conn = await pool.getConnection();
    
    await conn.query(
      `INSERT INTO webhook_test_logs (event_type, payload, received_at)
       VALUES (?, ?, NOW())`,
      [event, JSON.stringify(req.body)]
    );
    
    res.status(200).json({
      message: 'Webhook received and logged successfully',
      event,
      timestamp
    });
  } catch (err) {
    console.error('Error logging webhook:', err);
    res.status(500).json({ message: 'Error logging webhook' });
  } finally {
    if (conn) conn.release();
  }
});

// Get all received webhooks for testing/debugging
router.get('/logs', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    
    const logs = await conn.query(
      `SELECT id, event_type, payload, received_at 
       FROM webhook_test_logs
       ORDER BY received_at DESC
       LIMIT 100`
    );
    
    res.json(logs);
  } catch (err) {
    console.error('Error fetching webhook logs:', err);
    res.status(500).json({ message: 'Error fetching webhook logs' });
  } finally {
    if (conn) conn.release();
  }
});

module.exports = router;