// src/models/yard.model.js
const mongoose = require('mongoose');

const subFieldSchema = new mongoose.Schema({
  name: { type: String, required: true }, // Tên hoặc số sân: "Sân 1", "Sân 2"
  status: { type: String, enum: ['active', 'maintenance'], default: 'active' }
});

const yardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  location: { type: String, required: true },
  priceMorning: { type: Number, required: true, min: 0 }, 
  priceEvening: { type: Number, required: true, min: 0 }, 
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, default: 'active' },
  image: { type: String },         
  subImages: [{ type: String }],
  subFields: [subFieldSchema] // Mảng chứa danh sách các sân con do chủ sân nhập vào
}, { timestamps: true });

module.exports = mongoose.models.Yard || mongoose.model('Yard', yardSchema);