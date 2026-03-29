const express = require('express');
const router = express.Router();
const Token = require('../models/Token');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/authMiddleware');
const ExcelJS = require('exceljs');
const bcrypt = require('bcrypt');

router.use(protect);
router.use(authorize('Admin'));

// Create User
router.post('/users', async (req, res) => {
    try {
        const { username, role } = req.body;
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let password = '';
        for (let i = 0; i < 6; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({ username, role, password: hashedPassword, currentPassword: password });
        res.status(201).json({ success: true, user: { username, role, currentPassword: password } });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

// View Users
router.get('/users', async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'Admin' } }).select('-password');
        res.status(200).json({ success: true, users });
    } catch(err) {
        res.status(500).json({ success: false, message: 'Error' });
    }
});

// Admin Dashboard Stats
router.get('/stats', async (req, res) => {
    try {
        const total = await Token.countDocuments();
        const startOfDay = new Date();
        startOfDay.setHours(0,0,0,0);
        const issuedToday = await Token.countDocuments({ createdAt: { $gte: startOfDay } });
        const deliveredToday = await Token.countDocuments({ status: 'DELIVERED', deliveryTimestamp: { $gte: startOfDay } });
        const pending = await Token.countDocuments({ status: 'PENDING' });
        const dueApproval = await Token.countDocuments({ status: 'PENDING_APPROVAL' });

        res.status(200).json({ success: true, stats: { total, issuedToday, deliveredToday, pending, dueApproval } });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// Get Tokens with filters
router.get('/tokens', async (req, res) => {
    try {
        const { status, date, search } = req.query;
        let query = {};
        if (status) query.status = status;
        if (date) {
            const d = new Date(date);
            const nextD = new Date(d);
            nextD.setDate(nextD.getDate() + 1);
            query.createdAt = { $gte: d, $lt: nextD };
        }
        if (search) {
            query.consumerName = { $regex: search, $options: 'i' };
        }
        const tokens = await Token.find(query).sort('-createdAt');
        res.status(200).json({ success: true, tokens });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// Approve token
router.put('/tokens/:id/approve', async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Reason is required for approval' });
        
        const token = await Token.findById(req.params.id);
        if(!token) return res.status(404).json({ success: false });
        token.status = 'PENDING';
        token.adminApproved = true;
        token.adminApprovalReason = reason;
        await token.save();
        res.status(200).json({ success: true, token });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// Manual Delivery (Backlogs)
router.put('/tokens/:id/manual-deliver', async (req, res) => {
    try {
        const { reason } = req.body;
        if (!reason) return res.status(400).json({ success: false, message: 'Reason is required for manual delivery' });
        
        const token = await Token.findById(req.params.id);
        if(!token) return res.status(404).json({ success: false });
        if(token.status === 'DELIVERED') return res.status(400).json({ success: false, message: 'Already delivered' });

        token.status = 'DELIVERED';
        token.deliveryTimestamp = new Date();
        token.deliveryBoyName = 'Admin (Manual)';
        token.adminApprovalReason = token.adminApprovalReason ? `${token.adminApprovalReason} | Manual Delivery: ${reason}` : `Manual Delivery: ${reason}`;
        
        await token.save();
        res.status(200).json({ success: true, token });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// Admin Verify Scan (Recheck regardless of status)
router.get('/verify/:data', async (req, res) => {
    try {
        const dataStr = Buffer.from(req.params.data, 'base64').toString('ascii');
        const parts = dataStr.split('|');
        if (parts.length !== 4 || parts[0] !== 'KINDANE') {
           return res.status(400).json({ success: false, message: 'Invalid QR format' });
        }
        const [_, tokenId, serialNo, qrHash] = parts;
        const token = await Token.findOne({ tokenId, qrHash });
        if (!token) return res.status(404).json({ success: false, message: 'Token not found' });
        
        res.status(200).json({ success: true, token });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// Export Excel
router.get('/export', async (req, res) => {
    try {
        const { reportType } = req.query; // daily, weekly, monthly
        let dateQuery = {};
        const now = new Date();
        if (reportType === 'daily') {
            const start = new Date(now.setHours(0,0,0,0));
            dateQuery = { createdAt: { $gte: start } };
        } else if (reportType === 'weekly') {
            const start = new Date(now.setDate(now.getDate() - 7));
            dateQuery = { createdAt: { $gte: start } };
        } else if (reportType === 'monthly') {
            const start = new Date(now.setMonth(now.getMonth() - 1));
            dateQuery = { createdAt: { $gte: start } };
        }

        const tokens = await Token.find(dateQuery).sort('-createdAt');

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Report');

        worksheet.columns = [
            { header: 'Consumer Name', key: 'consumerName', width: 25 },
            { header: 'Contact', key: 'contactNo', width: 15 },
            { header: 'Token ID', key: 'tokenId', width: 20 },
            { header: 'Delivery Date', key: 'deliveryTimestamp', width: 20 },
            { header: 'Status', key: 'status', width: 15 },
        ];

        tokens.forEach(t => {
            worksheet.addRow({
                consumerName: t.consumerName || 'N/A',
                contactNo: t.contactNo || 'N/A',
                tokenId: t.tokenId,
                deliveryTimestamp: t.deliveryTimestamp ? t.deliveryTimestamp.toLocaleString() : 'N/A',
                status: t.status
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=' + `report_${reportType}.xlsx`);
        
        await workbook.xlsx.write(res);
        res.end();
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// Delete User
router.delete('/users/:id', async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.status(200).json({ success: true });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

// Refresh all passwords immediately
router.post('/users/refresh-passwords', async (req, res) => {
    try {
        const users = await User.find({ role: { $ne: 'Admin' }, isActive: true });
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        for (const user of users) {
            let password = '';
            for (let i = 0; i < 6; i++) {
                password += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            const salt = await bcrypt.genSalt(10);
            user.password = await bcrypt.hash(password, salt);
            user.currentPassword = password;
            await user.save();
        }
        res.status(200).json({ success: true, message: 'All passwords refreshed for the day' });
    } catch(err) {
        res.status(500).json({ success: false });
    }
});

module.exports = router;
