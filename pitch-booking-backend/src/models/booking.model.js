const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  yard: { type: mongoose.Schema.Types.ObjectId, ref: 'Yard', required: true }, // ID cụm sân tổng quát
  subFieldId: { type: mongoose.Schema.Types.ObjectId, required: true },       // ID sân con cụ thể
  subFieldName: { type: String, required: true },                              // Tên sân con (VD: "Sân số 1")
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },       // Ngày đá (YYYY-MM-DD)
  startTime: { type: String, required: true },  // Giờ bắt đầu
  endTime: { type: String, required: true },    // Giờ kết thúc
  totalPrice: { type: Number, required: true },
  status: { type: String, default: 'pending' }, // pending, confirmed, cancelled
}, { timestamps: true });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);