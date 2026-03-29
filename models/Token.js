const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  serialNo: { type: Number, required: true },
  tokenId: { type: String, required: true, unique: true },
  qrHash: { type: String, required: true },
  dacNumber: { type: String },
  contactNo: { type: String },
  consumerName: { type: String },
  consumerNo: { type: String },
  expectedDeliveryDate: { type: Date },
  nextDueDays: { type: Number, enum: [25, 35, 45] },
  status: { type: String, enum: ['GENERATED', 'PENDING', 'DELIVERED', 'PENDING_APPROVAL'], default: 'GENERATED' },
  deliveryTimestamp: { type: Date },
  deliveryBoyName: { type: String },
  adminApproved: { type: Boolean, default: false },
  adminApprovalReason: { type: String },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  lockedAt: { type: Date },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('Token', tokenSchema);
