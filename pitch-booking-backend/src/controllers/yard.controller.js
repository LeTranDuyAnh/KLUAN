const fs = require('fs');
const path = require('path');
const util = require('util');
const pipeline = util.promisify(require('stream').pipeline);
const Yard = require('../models/yard.model');

async function createYard(req, reply) {
  try {
    const ownerId = req.user.userId || req.user._id;
    
    let fields = {};
    let imagePath = '';
    let subFieldNames = [];

    // Duyệt qua từng phần của multipart form-data
    const parts = req.parts();
    for await (const part of parts) {
      if (part.file) {
        // Xử lý lưu file vật lý
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const filename = uniqueSuffix + '-' + part.filename;
        const uploadDir = path.join(__dirname, '../../public/uploads');
        
        if (!fs.existsSync(uploadDir)) {
          fs.mkdirSync(uploadDir, { recursive: true });
        }

        const savePath = path.join(uploadDir, filename);
        await pipeline(part.file, fs.createWriteStream(savePath));
        imagePath = `/uploads/${filename}`;
      } else {
        // Xử lý các trường dữ liệu text thông thường
        if (part.fieldname === 'subFieldNames') {
          subFieldNames.push(part.value);
        } else {
          fields[part.fieldname] = part.value;
        }
      }
    }

    const { name, type, location, priceMorning, priceEvening } = fields;

    // Chuẩn hóa danh sách sân con
    const subFields = subFieldNames
      .filter(n => n && n.trim() !== '')
      .map(name => ({ name: name.trim(), status: 'active' }));

    if (subFields.length === 0) {
      return reply.code(400).send({ success: false, error: 'Cụm sân phải có ít nhất một sân con!' });
    }

    const newYard = new Yard({
      owner: ownerId,
      name,
      type,
      location,
      priceMorning: Number(priceMorning),
      priceEvening: Number(priceEvening),
      image: imagePath,
      subFields
    });

    await newYard.save();

    return reply.code(201).send({
      success: true,
      message: 'Thêm cơ sở sân và upload ảnh thành công!',
      data: newYard
    });

  } catch (error) {
    console.error('Lỗi tạo sân multipart:', error);
    return reply.code(500).send({ success: false, error: 'Lỗi server nội bộ khi lưu sân!' });
  }
}

module.exports = { createYard };