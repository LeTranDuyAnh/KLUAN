const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  yard: { type: mongoose.Schema.Types.ObjectId, ref: 'Yard', required: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true }, // Ngày đá (YYYY-MM-DD)
  startTime: { type: String, required: true }, // Giờ bắt đầu, VD: "16:30"
  endTime: { type: String, required: true },   // Giờ kết thúc, VD: "19:00"
  slots: [{ type: String }], // Ví dụ: ["07:00", "07:30", "08:00"]
  totalPrice: { type: Number, required: true }, // Tiền tính tự động theo block 30p
  status: { type: String, default: 'pending' }, // pending, confirmed, cancelled
}, { timestamps: true });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);