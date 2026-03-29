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

    const token = await Token.findOneAndUpdate(
      { tokenId, qrHash, status: { $in: ['PENDING', 'PENDING_APPROVAL', 'UPDATE_PENDING'] } },
      { 
        $set: { 
          status: 'DELIVERED', 
          deliveryTimestamp: new Date(), 
          deliveryBoyName: deliveryBoyName || req.user.username 
        } 
      },
      { new: true }
    );

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token not ready for delivery or already delivered' });
    }

    res.status(200).json({ success: true, message: 'Delivery marked successfully', token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
