const mongoose = require('mongoose');

const userVoucherSchema = new mongoose.Schema(
  {
    // User vẫn dùng ObjectId
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // Voucher._id đang là String
    // nên voucherId cũng phải là String
    voucherId: {
      type: String,
      ref: 'Voucher',
      required: true
    },

    // false = chưa sử dụng
    // true = đã sử dụng
    isUsed: {
      type: Boolean,
      default: false
    },

    assignedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.UserVoucher ||
  mongoose.model('UserVoucher', userVoucherSchema);