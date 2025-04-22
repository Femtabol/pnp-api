const axios = require('axios');
const pool = require('../config/database');

/**
 * Events that can trigger webhooks
 */
const WEBHOOK_EVENTS = {
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  TOKEN_USED: 'token.used',
  SUBSCRIPTION_UPDATED: 'subscription.updated'
};

/**
 * Send a webhook notification to all registered webhook URLs for a specific event
 * @param {string} event - The event type from WEBHOOK_EVENTS
 * @param {object} payload - Data to send with the webhook
 */
async function sendWebhook(event, payload) {
  let conn;
  try {
    conn = await pool.getConnection();
    
    // Get all active webhooks for this event
    const webhooks = await conn.query(
      'SELECT * FROM webhooks WHERE active = 1 AND event_type = ? OR event_type = "all"',
      [event]
    );
    
    if (webhooks.length === 0) return;
    
    // Add common fields to all webhook payloads
    const webhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: payload
    };
    
    // Send the webhook to all registered URLs
    const promises = webhooks.map(webhook => {
      return axios.post(webhook.url, webhookPayload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': generateSignature(webhook.secret_key, webhookPayload)
        },
        timeout: 5000 // 5 second timeout
      })
      .then(async response => {
        // Log successful webhook delivery
        await conn.query(
          'INSERT INTO webhook_logs (webhook_id, event_type, status, response_code) VALUES (?, ?, ?, ?)',
          [webhook.id, event, 'success', response.status]
        );
        return { success: true, webhookId: webhook.id };
      })
      .catch(async error => {
        // Log failed webhook delivery
        const responseCode = error.response ? error.response.status : 0;
        await conn.query(
          'INSERT INTO webhook_logs (webhook_id, event_type, status, response_code, error_message) VALUES (?, ?, ?, ?, ?)',
          [webhook.id, event, 'failed', responseCode, error.message.substring(0, 255)]
        );
        return { success: false, webhookId: webhook.id, error: error.message };
      });
    });
    
    return await Promise.all(promises);
  } catch (err) {
    console.error('Error sending webhook:', err);
    return { success: false, error: 'Internal server error' };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Generate a signature for webhook payload verification
 * @param {string} secret - The webhook secret key
 * @param {object} payload - The webhook payload
 * @returns {string} HMAC signature
 */
function generateSignature(secret, payload) {
  const crypto = require('crypto');
  const hmac = crypto.createHmac('sha256', secret || '');
  return hmac.update(JSON.stringify(payload)).digest('hex');
}

module.exports = {
  WEBHOOK_EVENTS,
  sendWebhook
};