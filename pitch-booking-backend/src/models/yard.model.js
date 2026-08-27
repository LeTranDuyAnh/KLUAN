// src/models/yard.model.js
const mongoose = require('mongoose');

const yardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, required: true },
  location: { type: String, required: true },
  priceMorning: { type: Number, required: true, min: 0 }, 
  priceEvening: { type: Number, required: true, min: 0 }, 
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, default: 'active' },
  image: { type: String },         
  subImages: [{ type: String }]    
}, { timestamps: true });

module.exports = mongoose.models.Yard || mongoose.model('Yard', yardSchema);