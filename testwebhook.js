// Simple script to test webhook functionality
require('dotenv').config();
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Configuration
const API_URL = 'http://localhost:9090/api';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Create a test admin token
const adminToken = jwt.sign({ 
  id: 1,  // Assuming user ID 1 is an admin
  is_admin: true 
}, JWT_SECRET, { expiresIn: '1h' });

async function testWebhooks() {
  try {
    console.log('🔍 Testing webhook functionality...');
    
    // 1. Create a webhook pointing to our test endpoint
    console.log('\n1. Creating test webhook...');
    const createResponse = await axios.post(`${API_URL}/webhooks`, {
      name: 'Test Webhook',
      url: `${API_URL}/webhook-test/receive`,
      event_type: 'all',
      active: true
    }, {
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`✅ Webhook created:`, createResponse.data);
    const webhookId = createResponse.data.id;
    const webhookSecret = createResponse.data.secret_key;
    
    // 2. Trigger a test user login
    console.log('\n2. Triggering user login...');
    await axios.post(`${API_URL}/auth/login`, {
      email: 'test@example.com',  // Replace with a valid user in your system
      password: 'password123'      // Replace with the correct password
    });
    
    // Wait a moment for webhook to process
    console.log('⏳ Waiting for webhook to process...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 3. Check webhook logs
    console.log('\n3. Checking webhook logs...');
    const logsResponse = await axios.get(`${API_URL}/webhook-test/logs`);
    
    if (logsResponse.data.length > 0) {
      console.log(`✅ Found ${logsResponse.data.length} webhook logs`);
      console.log('Latest webhook:', JSON.parse(logsResponse.data[0].payload));
    } else {
      console.log('❌ No webhook logs found');
    }
    
    // 4. Clean up - delete the test webhook
    console.log('\n4. Cleaning up test webhook...');
    await axios.delete(`${API_URL}/webhooks/${webhookId}`, {
      headers: {
        'Authorization': `Bearer ${adminToken}`
      }
    });
    
    console.log('✅ Test webhook deleted');
    console.log('\n✨ Webhook test completed');
    
  } catch (error) {
    console.error('Error testing webhooks:', error.response?.data || error.message);
  }
}

testWebhooks();