const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  yard: { type: mongoose.Schema.Types.ObjectId, ref: 'Yard', required: true },
  subFieldId: { type: mongoose.Schema.Types.ObjectId, required: true },      
  subFieldName: { type: String, required: true },                                                         
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: String, required: true },       
  startTime: { type: String, required: true },  
  endTime: { type: String, required: true },    
  slots: { type: [String], default: [] },       // <-- Thêm trường này để lưu mảng các slot chi tiết
  totalPrice: { type: Number, required: true },
  status: { type: String, default: 'pending' }, 
  // Bổ sung vào bookingSchema:
  voucher: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', default: null },
  //discountAmount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);