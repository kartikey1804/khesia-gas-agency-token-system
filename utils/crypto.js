const crypto = require('crypto');

exports.generateQRHash = (tokenId, serialNo) => {
  const secret = process.env.QR_SECRET || 'qr_hash_secret_change_in_prod';
  const data = `KHESIA|${tokenId}|${serialNo}`;
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
};
