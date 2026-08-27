const mongoose = require('mongoose');

const facilitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  address: {
    street: String,
    district: String,
    city: String,
  },
  sportCategory: { 
    type: String, 
    enum: ['Bóng đá', 'Bóng rổ', 'Bóng chuyền', 'Cầu lông', 'Tennis'], 
    required: true 
  },
  subFields: [
    {
      subFieldId: { type: String, required: true }, 
      surfaceType: String, 
      pricing: {
        morningPrice: { type: Number, required: true }, // 6h - 15h
        eveningPrice: { type: Number, required: true }  // sau 15h
      },
      status: { type: String, enum: ['active', 'maintenance'], default: 'active' }
    }
  ],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Facility', facilitySchema);