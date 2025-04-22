const axios = require('axios');

// Define the events here instead of importing them
const WEBHOOK_EVENTS = {
  USER_REGISTERED: 'user.registered',
  USER_LOGIN: 'user.login',
  TOKEN_USED: 'token.used',
  SUBSCRIPTION_UPDATED: 'subscription.updated'
};

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
 * Send a Discord webhook
 * @param {string} webhookUrl - Discord webhook URL
 * @param {string} event - Event type
 * @param {object} data - Event data
 * @returns {Promise} - Axios response promise
 */
async function sendDiscordWebhook(webhookUrl, event, data) {
  const payload = formatDiscordPayload(event, data);
  
  return axios.post(webhookUrl, payload, {
    headers: {
      'Content-Type': 'application/json'
    },
    timeout: 5000 // 5 second timeout
  });
}

/**
 * Check if URL is a Discord webhook URL
 * @param {string} url - URL to check
 * @returns {boolean} - True if Discord webhook URL
 */
function isDiscordWebhook(url) {
  return url.startsWith('https://discord.com/api/webhooks/') || 
         url.startsWith('https://discordapp.com/api/webhooks/');
}

module.exports = {
  formatDiscordPayload,
  sendDiscordWebhook,
  isDiscordWebhook
};