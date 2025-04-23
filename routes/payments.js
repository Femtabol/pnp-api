// server/routes/payments.js
const express = require('express');
const axios = require('axios');
const router = express.Router();

// Blockonomics API configuration
const BLOCKONOMICS_API_URL = process.env.BLOCKONOMICS_API_URL || 'https://www.blockonomics.co/api';
const CALLBACK_URL = process.env.CALLBACK_URL || 'http://localhost:9090/api/payments/callback';

// Helper to handle API errors
const handleApiError = (error, res) => {
  console.error('Blockonomics API Error:', error.response?.data || error.message);
  
  return res.status(error.response?.status || 500).json({
    error: error.response?.data?.message || 'An error occurred while processing the payment'
  });
};

/**
 * Route to create a new payment
 */
router.post('/create', async (req, res) => {
  try {
    const { 
      planId, 
      email, 
      userId, 
      price, 
      crypto = 'BTC', 
      quantity = 1, 
      apiKey 
    } = req.body;
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    if (!price) {
      return res.status(400).json({ error: 'Price is required' });
    }
    
    console.log('Creating new payment with Blockonomics:', { price, crypto });
    
    // Call Blockonomics API to get a new address
    const response = await axios.post(`${BLOCKONOMICS_API_URL}/new_address`, {
      reset: 1 // Use a new address
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    // Get the address from the response
    const address = response.data.address;
    
    // Get current price for conversion
    const priceResponse = await axios.get(`${BLOCKONOMICS_API_URL}/price?currency=USD`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    let currentPrice = 0;
    if (crypto === 'BTC') {
      currentPrice = priceResponse.data.price || 0;
    } else if (crypto === 'ETH' && priceResponse.data.eth) {
      currentPrice = priceResponse.data.eth || 0;
    }
    
    const cryptoAmount = (price / currentPrice).toFixed(8);
    
    const paymentData = {
      address: address,
      crypto_amount: cryptoAmount,
      price: price,
      status: 'pending',
      crypto: crypto,
      qrcode_url: `https://www.blockonomics.co/qr?data=${crypto.toLowerCase()}:${address}?amount=${cryptoAmount}`,
      expiry: new Date(Date.now() + 30 * 60 * 1000).toISOString() // 30 min from now
    };
    
    // Save the payment in your database
    // This is where you'd typically store the payment details for tracking
    
    res.json(paymentData);
  } catch (error) {
    return handleApiError(error, res);
  }
});

/**
 * Route to check payment status
 */
router.get('/status', async (req, res) => {
  try {
    const { address } = req.query;
    const apiKey = req.headers.authorization?.split(' ')[1] || req.query.apiKey;
    
    if (!address) {
      return res.status(400).json({ error: 'Address is required' });
    }
    
    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    // Call Blockonomics API to get status
    const response = await axios.get(`${BLOCKONOMICS_API_URL}/address_summary?addr=${address}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    // Process the response
    const { status, confirmations } = response.data;
    
    const paymentStatus = {
      status: status || 'pending',
      confirmations: confirmations || 0
    };
    
    res.json(paymentStatus);
  } catch (error) {
    return handleApiError(error, res);
  }
});

/**
 * Route to get current cryptocurrency price
 */
router.get('/price', async (req, res) => {
  try {
    const { crypto = 'BTC', fiat = 'USD' } = req.query;
    const apiKey = req.headers.authorization?.split(' ')[1] || req.query.apiKey;
    
    // Call Blockonomics API for price data
    const response = await axios.get(`${BLOCKONOMICS_API_URL}/price?currency=${fiat}`, {
      headers: {
        'Authorization': apiKey ? `Bearer ${apiKey}` : undefined
      }
    });
    
    // Extract price for the requested cryptocurrency
    let price = 0;
    
    if (crypto === 'BTC') {
      price = response.data.price || 0;
    } else if (crypto === 'ETH' && response.data.eth) {
      price = response.data.eth || 0;
    }
    
    res.json({ price });
  } catch (error) {
    return handleApiError(error, res);
  }
});

/**
 * Callback endpoint for Blockonomics to notify of payment updates
 */
router.post('/callback', async (req, res) => {
  try {
    const { addr, status, txid, value } = req.body;
    
    console.log('Payment callback received:', req.body);
    
    // Here you would update your database with the payment status
    // and trigger any business logic related to completed payments
    
    res.json({ success: true });
  } catch (error) {
    console.error('Error processing callback:', error);
    res.status(500).json({ error: 'Error processing callback' });
  }
});

module.exports = router;