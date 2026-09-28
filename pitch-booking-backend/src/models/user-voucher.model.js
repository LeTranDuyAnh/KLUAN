const mongoose = require('mongoose');

const userVoucherSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  voucherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', required: true },
  isUsed: { type: Boolean, default: false }, // false: Chưa dùng | true: Đã dùng
  assignedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.models.UserVoucher || mongoose.model('UserVoucher', userVoucherSchema);