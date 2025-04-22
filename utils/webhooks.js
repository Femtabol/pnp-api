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

// Function to check if URL is a Discord webhook
function isDiscordWebhook(url) {
  return url.startsWith('https://discord.com/api/webhooks/') || 
         url.startsWith('https://discordapp.com/api/webhooks/');
}

/**
 * Format payload for Discord webhook
 * @param {string} event - Event type from WEBHOOK_EVENTS
 * @param {object} data - Event data
 * @returns {object} - Discord webhook payload
 */
function formatDiscordPayload(event, data) {
  // Base embed structure with color
  let color = 0x5865F2; // Discord blue color
  let title = '';
  let description = '';
  let fields = [];

  // Format differently based on event type
  switch(event) {
    case WEBHOOK_EVENTS.USER_REGISTERED:
    case 'user.registered':
      color = 0x57F287; // Green
      title = 'New User Registration';
      description = `**${data.name}** has registered a new account.`;
      fields = [
        {
          name: 'User ID',
          value: `${data.userId}`,
          inline: true
        },
        {
          name: 'Email',
          value: data.email,
          inline: true
        },
        {
          name: 'Subscription',
          value: data.subscription || 'free',
          inline: true
        }
      ];
      break;
    
    case WEBHOOK_EVENTS.USER_LOGIN:
    case 'user.login':
      color = 0xFEE75C; // Yellow
      title = 'User Login';
      description = `**${data.name}** has logged in.`;
      fields = [
        {
          name: 'User ID',
          value: `${data.userId}`,
          inline: true
        },
        {
          name: 'Email',
          value: data.email,
          inline: true
        },
        {
          name: 'Subscription',
          value: data.subscription,
          inline: true
        }
      ];
      break;
    
    case WEBHOOK_EVENTS.TOKEN_USED:
    case 'token.used':
      color = 0xEB459E; // Pink
      title = 'Download Token Used';
      description = `**${data.name}** has used a download token.`;
      fields = [
        {
          name: 'User ID',
          value: `${data.userId}`,
          inline: true
        },
        {
          name: 'File',
          value: data.fileName,
          inline: true
        },
        {
          name: 'Tokens Remaining',
          value: `${data.tokensRemaining}/${data.tokensPerDay}`,
          inline: true
        }
      ];
      break;
    
    case WEBHOOK_EVENTS.SUBSCRIPTION_UPDATED:
    case 'subscription.updated':
      color = 0x5865F2; // Blue
      title = 'Subscription Updated';
      description = `**${data.name}** has updated their subscription.`;
      fields = [
        {
          name: 'User ID',
          value: `${data.userId}`,
          inline: true
        },
        {
          name: 'Old Plan',
          value: data.oldSubscription,
          inline: true
        },
        {
          name: 'New Plan',
          value: data.newSubscription,
          inline: true
        },
        {
          name: 'Tokens Per Day',
          value: `${data.tokensPerDay}`,
          inline: true
        }
      ];
      break;
    
    default:
      title = 'Event Notification';
      description = `An event of type "${event}" has occurred.`;
      // Create fields from data dynamically
      fields = Object.entries(data).map(([key, value]) => ({
        name: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
        value: `${value}`,
        inline: true
      }));
  }

  // Build Discord webhook payload
  return {
    username: 'PnP Backend API',
    avatar_url: 'https://i.imgur.com/4M34hi2.png', // You can replace this with your logo URL
    content: '',
    embeds: [{
      title,
      description,
      color,
      fields,
      timestamp: new Date().toISOString(),
      footer: {
        text: `Event: ${event}`
      }
    }]
  };
}

/**
 * Helper function to convert BigInt to Number for JSON serialization
 */
function prepareBigIntForJson(payload) {
  return JSON.parse(JSON.stringify(payload, (key, value) => 
    typeof value === 'bigint' ? Number(value) : value
  ));
}

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
      'SELECT * FROM webhooks WHERE active = 1 AND (event_type = ? OR event_type = "all")',
      [event]
    );
    
    if (webhooks.length === 0) return;
    
    // Convert any BigInt values in payload to Number for safe JSON serialization
    const safePayload = prepareBigIntForJson(payload);
    
    // Add common fields to all webhook payloads
    const standardWebhookPayload = {
      event,
      timestamp: new Date().toISOString(),
      data: safePayload
    };
    
    // Send the webhook to all registered URLs
    const promises = webhooks.map(webhook => {
      // Convert webhook.id from BigInt to Number if needed
      const webhookId = typeof webhook.id === 'bigint' ? Number(webhook.id) : webhook.id;
      
      // Determine if this is a Discord webhook
      const isDiscord = isDiscordWebhook(webhook.url);
      
      let request;
      if (isDiscord) {
        // Use Discord-specific formatter and sender
        request = axios.post(webhook.url, formatDiscordPayload(event, safePayload), {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000 // 5 second timeout
        });
      } else {
        // Use standard webhook format with signature
        request = axios.post(webhook.url, standardWebhookPayload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': generateSignature(webhook.secret_key, standardWebhookPayload)
          },
          timeout: 5000 // 5 second timeout
        });
      }
      
      return request
        .then(async response => {
          // Log successful webhook delivery
          await conn.query(
            'INSERT INTO webhook_logs (webhook_id, event_type, status, response_code) VALUES (?, ?, ?, ?)',
            [webhookId, event, 'success', response.status]
          );
          return { success: true, webhookId, isDiscord };
        })
        .catch(async error => {
          // Log failed webhook delivery
          const responseCode = error.response ? error.response.status : 0;
          console.error(`Webhook ${webhookId} delivery failed:`, error.message);
          await conn.query(
            'INSERT INTO webhook_logs (webhook_id, event_type, status, response_code, error_message) VALUES (?, ?, ?, ?, ?)',
            [webhookId, event, 'failed', responseCode, error.message.substring(0, 255)]
          );
          return { success: false, webhookId, isDiscord, error: error.message };
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