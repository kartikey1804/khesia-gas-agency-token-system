const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const { protect, authorize } = require('../middleware/authMiddleware');

// @route   GET /api/delivery/dashboard
// @desc    Get delivery dashboard stats and pending list
// @access  Delivery, Admin, Staff
router.get('/dashboard', protect, authorize('Delivery', 'Admin', 'Staff'), async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const deliveredToday = await Token.countDocuments({ status: 'DELIVERED', deliveryTimestamp: { $gte: startOfDay }, deliveryBoyName: req.user.username });
        
        const nextDay = new Date(startOfDay);
        nextDay.setDate(nextDay.getDate() + 1);
        const pendingTodayList = await Token.find({ 
            status: 'PENDING', 
            expectedDeliveryDate: { $lt: nextDay } 
        }).select('consumerNo contactNo dacNumber consumerName expectedDeliveryDate');
        
        res.status(200).json({ success: true, deliveredToday, pendingTodayList });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// @route   PUT /api/delivery/deliver
// @desc    Mark token as delivered
// @access  Delivery, Admin, Staff
router.put('/deliver', protect, authorize('Admin', 'Staff', 'Delivery'), async (req, res) => {
  try {
    const { tokenId, qrHash, deliveryBoyName } = req.body;

    const token = await Token.findOne({ tokenId, qrHash });
    if (!token) {
      return res.status(404).json({ success: false, message: 'Invalid or not found Token' });
    }

    if (token.status === 'DELIVERED') {
      return res.status(400).json({ success: false, message: 'Gas already delivered for this token' });
    }

    if (token.status === 'PENDING_APPROVAL') {
      return res.status(400).json({ success: false, message: 'Delivery requires Admin approval first' });
    }

    token.status = 'DELIVERED';
    token.deliveryTimestamp = new Date();
    token.deliveryBoyName = deliveryBoyName || req.user.username;

    await token.save();

    res.status(200).json({ success: true, message: 'Delivery marked successfully', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
