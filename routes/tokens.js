const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const { protect, authorize } = require('../middleware/authMiddleware');
const { generateQRHash } = require('../utils/crypto');
const QRCode = require('qrcode');

// Helper for unique ID
const generateUniqueId = () => Math.random().toString(36).substr(2, 9);

// @route   POST /api/tokens/generate
// @desc    Generate multiple tokens
// @access  Staff, Admin
router.post('/generate', protect, authorize('Admin', 'Staff'), async (req, res) => {
  try {
    const { count = 1, startFromOne = false } = req.body;
    let lastToken = await Token.findOne().sort({ serialNo: -1 });
    
    let startSerial = (lastToken && !startFromOne) ? lastToken.serialNo + 1 : 1;
    
    const newTokens = [];
    for (let i = 0; i < count; i++) {
      const serialNo = startSerial + i;
      const tokenId = generateUniqueId();
      const qrHash = generateQRHash(tokenId, serialNo);

      const tokenStr = `KINDANE|${tokenId}|${serialNo}|${qrHash}`;
      const qrImage = await QRCode.toDataURL(tokenStr);

      const token = await Token.create({
        serialNo,
        tokenId,
        qrHash,
        generatedBy: req.user._id,
      });

      newTokens.push({ ...token.toObject(), qrImage });
    }

    res.status(201).json({ success: true, tokens: newTokens });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/tokens/stats
// @desc    Get staff stats
// @access  Staff, Admin
router.get('/stats', protect, authorize('Admin', 'Staff'), async (req, res) => {
    try {
        const totalIssued = await Token.countDocuments();
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const issuedToday = await Token.countDocuments({ createdAt: { $gte: startOfDay } });
        const pending = await Token.countDocuments({ status: 'PENDING' });
        res.status(200).json({ success: true, stats: { totalIssued, issuedToday, pending } });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// @route   POST /api/tokens/fill
// @desc    Staff fills token data after scan
// @access  Staff, Admin
router.post('/fill', protect, authorize('Admin', 'Staff'), async (req, res) => {
  try {
    const { tokenId, qrHash, dacNumber, contactNo, consumerName, consumerNo, expectedDeliveryDate, nextDueDays, isEarlyRequest } = req.body;

    if (!dacNumber || !contactNo || !consumerName || !consumerNo || !expectedDeliveryDate || !nextDueDays) {
       return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (contactNo.length !== 10 || isNaN(contactNo)) {
       return res.status(400).json({ success: false, message: 'Contact number must be exactly 10 digits' });
    }

    const token = await Token.findOne({ tokenId, qrHash });
    if (!token) {
      return res.status(404).json({ success: false, message: 'Invalid or not found Token' });
    }

    if (token.consumerName) {
      return res.status(400).json({ success: false, message: 'Token is already filled' });
    }

    let status = 'PENDING';
    let adminApproved = false;

    if (isEarlyRequest) {
      status = 'PENDING_APPROVAL'; // Or block
    }

    token.dacNumber = dacNumber;
    token.contactNo = contactNo;
    token.consumerName = consumerName;
    token.consumerNo = consumerNo;
    token.expectedDeliveryDate = expectedDeliveryDate;
    token.nextDueDays = nextDueDays;
    token.status = status;
    token.adminApproved = adminApproved;

    await token.save();

    res.status(200).json({ success: true, token, message: isEarlyRequest ? 'Admin Approval Required' : 'Token filled successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @route   GET /api/tokens/scan/:data
// @desc    Get token details from QR data
// @access  Staff, Delivery
router.get('/scan/:data', protect, async (req, res) => {
  try {
     const dataStr = Buffer.from(req.params.data, 'base64').toString('ascii'); 
     // Format: KINDANE|TOKEN_ID|SERIAL_NO|HASH
     const parts = dataStr.split('|');
     if (parts.length !== 4 || parts[0] !== 'KINDANE') {
        return res.status(400).json({ success: false, message: 'Invalid QR format' });
     }
     const [_, tokenId, serialNo, qrHash] = parts;

     const token = await Token.findOne({ tokenId, qrHash });
     if (!token) return res.status(404).json({ success: false, message: 'Token not found or tampered' });
     
     if (token.status === 'DELIVERED') {
        return res.status(400).json({ success: false, message: 'QR has already been used. Permanently invalid.' });
     }
     if (token.createdAt && (Date.now() - new Date(token.createdAt).getTime()) > 12 * 24 * 60 * 60 * 1000) {
        return res.status(400).json({ success: false, message: 'QR has expired (Older than 12 days)' });
     }
     if (token.lockedAt && (Date.now() - new Date(token.lockedAt).getTime()) < 2 * 60 * 1000 && token.lockedBy.toString() !== req.user._id.toString()) {
        return res.status(400).json({ success: false, message: 'QR is currently being processed by another device' });
     }

     token.lockedBy = req.user._id;
     token.lockedAt = new Date();
     await token.save();

     res.status(200).json({ success: true, token });
  } catch(err) {
     res.status(500).json({ success: false, message: 'Server Error' });
  }
});

module.exports = router;
