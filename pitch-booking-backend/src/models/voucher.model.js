const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  discountValue: { type: Number, required: true }, // Số tiền giảm (VD: 50000)
  quantity: { type: Number, required: true }, // Tổng số lượng phát hành
  usedCount: { type: Number, default: 0 }, // Số lần đã dùng
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  status: { type: String, enum: ['active', 'expired', 'disabled'], default: 'active' }
}, { timestamps: true });

module.exports = mongoose.models.Voucher || mongoose.model('Voucher', voucherSchema);