const express = require('express');
const crypto = require('crypto');
const authenticateToken = require('../middleware/auth');
const isAdmin = require('../middleware/admin');
const pool = require('../config/database');
const { WEBHOOK_EVENTS } = require('../utils/webhooks');

const router = express.Router();

// Get all webhooks (admin only)
router.get('/', authenticateToken, isAdmin, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const webhooks = await conn.query(
      `SELECT w.id, w.name, w.url, w.event_type, 
      w.created_at, w.active, u.name as created_by_name
      FROM webhooks w
      JOIN users u ON w.created_by = u.id
      ORDER BY w.created_at DESC`
    );
    
    res.json(webhooks);
  } catch (err) {
    console.error('Error fetching webhooks:', err);
    res.status(500).json({ message: 'Failed to retrieve webhooks' });
  } finally {
    if (conn) conn.release();
  }
});

// Get webhook details including recent logs
router.get('/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  let conn;
  
  try {
    conn = await pool.getConnection();
    
    // Get webhook details
    const [webhook] = await conn.query(
      `SELECT w.id, w.name, w.url, w.event_type, 
      w.created_at, w.active, u.name as created_by_name
      FROM webhooks w
      JOIN users u ON w.created_by = u.id
      WHERE w.id = ?`,
      [id]
    );
    
    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }
    
    // Get recent logs for this webhook
    const logs = await conn.query(
      `SELECT id, event_type, status, response_code, 
      error_message, created_at
      FROM webhook_logs
      WHERE webhook_id = ?
      ORDER BY created_at DESC
      LIMIT 100`,
      [id]
    );
    
    res.json({
      ...webhook,
      logs
    });
  } catch (err) {
    console.error('Error fetching webhook details:', err);
    res.status(500).json({ message: 'Failed to retrieve webhook details' });
  } finally {
    if (conn) conn.release();
  }
});

// Create a new webhook
router.post('/', authenticateToken, isAdmin, async (req, res) => {
  const { name, url, event_type, active } = req.body;
  
  // Basic validation
  if (!name || !url || !event_type) {
    return res.status(400).json({ message: 'Name, URL and event type are required' });
  }
  
  // Validate the event type
  const validEvents = Object.values(WEBHOOK_EVENTS);
  validEvents.push('all'); // Allow subscribing to all events
  
  if (!validEvents.includes(event_type)) {
    return res.status(400).json({ 
      message: 'Invalid event type', 
      validEvents 
    });
  }
  
  // Generate a random secret key
  const secretKey = crypto.randomBytes(32).toString('hex');
  
  let conn;
  try {
    conn = await pool.getConnection();
    
    const result = await conn.query(
      `INSERT INTO webhooks (name, url, event_type, secret_key, created_by, active)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [name, url, event_type, secretKey, req.user.id, active !== false]
    );
    
    res.status(201).json({
      id: result.insertId,
      name,
      url,
      event_type,
      secret_key: secretKey,
      active: active !== false,
      message: 'Webhook created successfully'
    });
  } catch (err) {
    console.error('Error creating webhook:', err);
    res.status(500).json({ message: 'Failed to create webhook' });
  } finally {
    if (conn) conn.release();
  }
});

// Update a webhook
router.put('/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, url, event_type, active } = req.body;
  
  // Basic validation
  if (!name || !url || !event_type) {
    return res.status(400).json({ message: 'Name, URL and event type are required' });
  }
  
  // Validate the event type
  const validEvents = Object.values(WEBHOOK_EVENTS);
  validEvents.push('all');
  
  if (!validEvents.includes(event_type)) {
    return res.status(400).json({ 
      message: 'Invalid event type', 
      validEvents 
    });
  }
  
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Check if webhook exists
    const [webhook] = await conn.query('SELECT id FROM webhooks WHERE id = ?', [id]);
    
    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }
    
    await conn.query(
      `UPDATE webhooks 
      SET name = ?, url = ?, event_type = ?, active = ?
      WHERE id = ?`,
      [name, url, event_type, active !== false, id]
    );
    
    res.json({
      id: parseInt(id),
      name,
      url,
      event_type,
      active: active !== false,
      message: 'Webhook updated successfully'
    });
  } catch (err) {
    console.error('Error updating webhook:', err);
    res.status(500).json({ message: 'Failed to update webhook' });
  } finally {
    if (conn) conn.release();
  }
});

// Regenerate webhook secret
router.post('/:id/regenerate-secret', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const secretKey = crypto.randomBytes(32).toString('hex');
  
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Check if webhook exists
    const [webhook] = await conn.query('SELECT id FROM webhooks WHERE id = ?', [id]);
    
    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }
    
    await conn.query(
      'UPDATE webhooks SET secret_key = ? WHERE id = ?',
      [secretKey, id]
    );
    
    res.json({
      id: parseInt(id),
      secret_key: secretKey,
      message: 'Webhook secret regenerated successfully'
    });
  } catch (err) {
    console.error('Error regenerating webhook secret:', err);
    res.status(500).json({ message: 'Failed to regenerate webhook secret' });
  } finally {
    if (conn) conn.release();
  }
});

// Delete a webhook
router.delete('/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Check if webhook exists
    const [webhook] = await conn.query('SELECT id FROM webhooks WHERE id = ?', [id]);
    
    if (!webhook) {
      return res.status(404).json({ message: 'Webhook not found' });
    }
    
    await conn.query('DELETE FROM webhooks WHERE id = ?', [id]);
    
    res.json({
      message: 'Webhook deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting webhook:', err);
    res.status(500).json({ message: 'Failed to delete webhook' });
  } finally {
    if (conn) conn.release();
  }
});

// Get webhook event types
router.get('/events/list', authenticateToken, isAdmin, (req, res) => {
  res.json({
    events: Object.entries(WEBHOOK_EVENTS).map(([key, value]) => ({
      id: value,
      name: key.split('_').map(word => 
        word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      ).join(' ')
    })),
    message: 'Available webhook events'
  });
});

module.exports = router;