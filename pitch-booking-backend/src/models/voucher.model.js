const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema(
  {
    _id: {
      type: String,
      required: true
    },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
    },

    ownerId: {
      type: String,
      required: true,
      ref: 'User'
    },

    discountValue: {
      type: Number,
      required: true,
      min: 0
    },

    quantity: {
      type: Number,
      required: true,
      min: 1
    },

    usedCount: {
      type: Number,
      default: 0,
      min: 0
    },

    startDate: {
      type: Date,
      required: true
    },

    endDate: {
      type: Date,
      required: true
    },

    status: {
      type: String,
      enum: ['active', 'expired', 'disabled'],
      default: 'active'
    }
  },
  {
    collection: 'vouchers',
    versionKey: false,
    timestamps: true
  }
);

module.exports =
  mongoose.models.Voucher ||
  mongoose.model('Voucher', voucherSchema);