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
      const qrImage = await QRCode.toDataURL(tokenStr, {
        errorCorrectionLevel: 'H',
        scale: 8,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#ffffff'
        }
      });

      const token = await Token.create({
        serialNo,
        tokenId,
        qrHash,
        status: 'GENERATED',
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
        const activeStatuses = ['PENDING', 'DELIVERED', 'PENDING_APPROVAL', 'UPDATE_PENDING'];
        const totalIssued = await Token.countDocuments({ status: { $in: activeStatuses } });
        
        // India Time (IST) offset is 5.5 hours
        const now = new Date();
        const istOffset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffset);
        istDate.setUTCHours(0, 0, 0, 0);
        // Correct start of day in UTC for IST 00:00
        const startOfIstDay = new Date(istDate.getTime() - istOffset);

        const issuedToday = await Token.countDocuments({ 
            filledAt: { $gte: startOfIstDay }, 
            status: { $in: activeStatuses } 
        });
        
        const pending = await Token.countDocuments({ status: { $in: ['PENDING', 'PENDING_APPROVAL', 'UPDATE_PENDING'] } });
        const unfilled = await Token.countDocuments({ status: 'GENERATED' });

        res.status(200).json({ success: true, stats: { totalIssued, issuedToday, pending, unfilled } });
    } catch(err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// @route   POST /api/tokens/fill
// @desc    Staff fills token data after scan
// @access  Staff, Admin
router.post('/fill', protect, authorize('Admin', 'Staff'), async (req, res) => {
  try {
    const { tokenId, qrHash, dacNumber, contactNo, consumerName, consumerNo, expectedDeliveryDate, nextDueDays, isEarlyRequest } = req.body;

    // Temporary lenience for v2.3 clients: Default nextDueDays to 30 if missing
    const finalNextDueDays = nextDueDays || 30;

    if (!dacNumber || !contactNo || !consumerName || !consumerNo || !expectedDeliveryDate) {
       return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (contactNo.length !== 10 || isNaN(contactNo)) {
       return res.status(400).json({ success: false, message: 'Contact number must be exactly 10 digits' });
    }

    const updateData = {
      dacNumber,
      contactNo,
      consumerName,
      consumerNo,
      expectedDeliveryDate,
      nextDueDays: finalNextDueDays,
      status: isEarlyRequest ? 'PENDING_APPROVAL' : 'PENDING',
      filledAt: new Date()
    };

    const token = await Token.findOneAndUpdate(
      { tokenId, qrHash, status: 'GENERATED' },
      { $set: updateData },
      { new: true }
    );

    if (!token) {
      return res.status(400).json({ success: false, message: 'Token already filled or invalid' });
    }

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

// @route   GET /api/tokens/scan-manual/:id
// @desc    Get token details by ID manually
// @access  Delivery, Admin, Staff
router.get('/scan-manual/:tokenId', protect, async (req, res) => {
  try {
     const token = await Token.findOne({ tokenId: req.params.tokenId });
     if (!token) return res.status(404).json({ success: false, message: 'Token not found' });
     res.status(200).json({ success: true, token });
  } catch(err) {
     res.status(500).json({ success: false, message: 'Server Error' });
  }
});

// @route   DELETE /api/tokens/unused
// @desc    Delete all unused (GENERATED) tokens
// @access  Staff, Admin
router.delete('/unused', protect, authorize('Admin', 'Staff'), async (req, res) => {
    try {
        const result = await Token.deleteMany({ status: 'GENERATED' });
        res.status(200).json({ success: true, message: `Deleted ${result.deletedCount} unused tokens.` });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Failed to delete' });
    }
});

// Request update for filled token
router.post('/:id/request-update', protect, authorize('Staff', 'Admin'), async (req, res) => {
    try {
        const token = await Token.findById(req.params.id);
        if (!token) return res.status(404).json({ success: false, message: 'Token not found' });
        if (token.status === 'UPDATE_PENDING') return res.status(400).json({ success: false, message: 'Update already pending' });

        token.pendingUpdate = req.body;
        token.updateRequestedBy = req.user._id;
        token.status = 'UPDATE_PENDING';
        await token.save();

        res.status(200).json({ success: true, message: 'Update request submitted to Admin' });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Failed to submit request' });
    }
});

const ExcelJS = require('exceljs');

// ... existing routes ...

// GET Customer Register
router.get('/register', protect, async (req, res) => {
    try {
        let query = { consumerName: { $exists: true, $ne: '' } };
        const { startDate, endDate, viewType } = req.query;

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            
            if (viewType === 'due') {
                query.expectedDeliveryDate = { $gte: start, $lte: end };
            } else {
                query.filledAt = { $gte: start, $lte: end };
            }
        }

        const tokens = await Token.find(query).sort({ filledAt: -1 });
        res.status(200).json({ success: true, tokens });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Failed to fetch register' });
    }
});

// GET Export Register
router.get('/export-register', protect, async (req, res) => {
    try {
        let query = { consumerName: { $exists: true, $ne: '' } };
        const { startDate, endDate, viewType } = req.query;

        if (startDate && endDate) {
            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            if (viewType === 'due') {
                query.expectedDeliveryDate = { $gte: start, $lte: end };
            } else {
                query.filledAt = { $gte: start, $lte: end };
            }
        }

        const tokens = await Token.find(query).sort({ filledAt: -1 });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Customer Register');

        sheet.columns = [
            { header: 'Serial No', key: 'serialNo', width: 10 },
            { header: 'Token ID', key: 'tokenId', width: 15 },
            { header: 'Consumer Name', key: 'consumerName', width: 25 },
            { header: 'Contact No', key: 'contactNo', width: 15 },
            { header: 'Consumer No', key: 'consumerNo', width: 15 },
            { header: 'DAC Number', key: 'dacNumber', width: 15 },
            { header: 'Date Filled', key: 'filledAt', width: 20 },
            { header: 'Expected Delivery', key: 'expectedDeliveryDate', width: 20 },
            { header: 'Status', key: 'status', width: 15 }
        ];

        tokens.forEach(t => {
            sheet.addRow({
                serialNo: t.serialNo,
                tokenId: t.tokenId,
                consumerName: t.consumerName,
                contactNo: t.contactNo,
                consumerNo: t.consumerNo,
                dacNumber: t.dacNumber,
                filledAt: t.filledAt ? t.filledAt.toLocaleString() : 'N/A',
                expectedDeliveryDate: t.expectedDeliveryDate ? new Date(t.expectedDeliveryDate).toLocaleDateString() : 'N/A',
                status: t.status
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=Customer_Register_${viewType || 'All'}.xlsx`);

        await workbook.xlsx.write(res);
        res.end();
    } catch(err) {
        res.status(500).send('Export failed');
    }
});

module.exports = router;
