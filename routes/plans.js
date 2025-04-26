// filepath: c:\Users\Umbreon\Documents\GitHub\pnp-api\routes\plans.js
const express = require('express');
const router = express.Router();
const tokenPlans = require('../utils/tokenPlans');

// Get all subscription plans
router.get('/', (req, res) => {
    res.json({
        message: 'Available subscription plans',
        plans: tokenPlans
    });
});

module.exports = router;