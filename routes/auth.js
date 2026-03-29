const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Setup Admin helper
const setupAdmin = async () => {
  try {
    const admin = await User.findOne({ username: 'kartikey1804' });
    if (!admin) {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Cleverclown@1', salt);
      await User.create({
        username: 'kartikey1804',
        password: hashedPassword,
        role: 'Admin',
      });
      console.log('Admin user created');
    }
  } catch (err) {
    console.error('Error setting up admin:', err);
  }
};
setTimeout(setupAdmin, 2000); // Wait for db connection

// Generate Password Helper
const generatePassword = () => {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let password = '';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

// @route   POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Please provide username and password' });
    }

    const user = await User.findOne({ username, isActive: true });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    // Token expires in 8 hours based on rules
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '8h',
    });

    res.status(200).json({ success: true, token, user: { username: user.username, role: user.role } });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
