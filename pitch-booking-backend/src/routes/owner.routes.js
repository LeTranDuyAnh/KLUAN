const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const util = require('util');
const pipeline = util.promisify(require('stream').pipeline);

const Yard = require('../models/yard.model');

async function ownerRoutes(fastify, options) {
  
  const verifyOwner = async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ success: false, error: 'Không tìm thấy Token xác thực!' });
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key'); 
      request.user = decoded; 

      if (request.user.role !== 'owner') {
        return reply.code(403).send({ success: false, error: 'Chỉ có Chủ sân mới có quyền truy cập!' });
      }
    } catch (err) {
      return reply.code(401).send({ success: false, error: 'Token không hợp lệ hoặc đã hết hạn!' });
    }
  };

  // 1. GET: Lấy danh sách sân của chủ sân
  fastify.get('/api/owner/yards', { preHandler: verifyOwner }, async (request, reply) => {
    try {
      const ownerId = request.user.id || request.user._id || request.user.userId; 
      const yards = await Yard.find({ owner: ownerId });
      return reply.code(200).send({ success: true, data: yards });
    } catch (err) {
      console.error("LỖI API OWNER YARDS:", err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // 2. POST: Thêm sân mới kèm danh sách sân con
  fastify.post('/api/owner/yards', { preHandler: verifyOwner }, async (request, reply) => {
    try {
      const ownerId = request.user.id || request.user._id || request.user.userId;
      
      let name, type, category, subType, location, priceMorning, priceEvening;
      let mainImagePath = '';
      let subImagePaths = [];
      let subFieldNames = [];

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'name') name = part.value;
          if (part.fieldname === 'type') type = part.value;
          if (part.fieldname === 'category') category = part.value;
          if (part.fieldname === 'subType') subType = part.value;
          if (part.fieldname === 'location') location = part.value;
          if (part.fieldname === 'priceMorning') priceMorning = Number(part.value);
          if (part.fieldname === 'priceEvening') priceEvening = Number(part.value);
          if (part.fieldname === 'subFieldNames') subFieldNames.push(part.value);
        } else if (part.type === 'file') {
          const uploadDir = path.join(__dirname, '../public/uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }

          const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(part.filename)}`;
          const filepath = path.join(uploadDir, filename);

          await pipeline(part.file, fs.createWriteStream(filepath));
          const relativePath = `/uploads/${filename}`;

          if (part.fieldname === 'image') {
            mainImagePath = relativePath;
          } else if (part.fieldname === 'subImages' && subImagePaths.length < 3) {
            subImagePaths.push(relativePath);
          }
        }
      }

      if (priceMorning < 0 || priceEvening < 0) {
        return reply.code(400).send({ success: false, error: 'Giá thuê sân không thể là số âm!' });
      }

      // Xây dựng mảng sân con từ form gửi lên
      const formattedSubFields = subFieldNames
        .filter(n => n && n.trim() !== '')
        .map(subName => ({ name: subName.trim(), status: 'active' }));

      if (formattedSubFields.length === 0) {
        return reply.code(400).send({ success: false, error: 'Cơ sở phải có ít nhất một sân con bên trong!' });
      }

      const newYard = await Yard.create({
        name,
        type: type || category,
        category,
        subType,
        location,
        priceMorning,
        priceEvening,
        owner: ownerId,
        image: mainImagePath,
        subImages: subImagePaths,
        subFields: formattedSubFields,
        status: 'active'
      });

      return reply.code(201).send({
        success: true,
        message: 'Thêm cơ sở sân và các sân con thành công!',
        data: newYard
      });
    } catch (err) {
      console.error("LỖI THÊM SÂN:", err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // 3. PUT: Sửa thông tin sân và danh sách sân con
  fastify.put('/api/owner/yards/:id', { preHandler: verifyOwner }, async (request, reply) => {
    try {
      const ownerId = request.user.id || request.user._id || request.user.userId;
      const yardId = request.params.id;

      const existingYard = await Yard.findOne({ _id: yardId, owner: ownerId });
      if (!existingYard) {
        return reply.code(404).send({ success: false, error: 'Không tìm thấy sân hoặc bạn không có quyền sửa!' });
      }

      let name, type, category, subType, location, priceMorning, priceEvening;
      let mainImagePath = existingYard.image;
      let subImagePaths = existingYard.subImages;
      let subFieldNames = [];

      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'name') name = part.value;
          if (part.fieldname === 'type') type = part.value;
          if (part.fieldname === 'category') category = part.value;
          if (part.fieldname === 'subType') subType = part.value;
          if (part.fieldname === 'location') location = part.value;
          if (part.fieldname === 'priceMorning') priceMorning = Number(part.value);
          if (part.fieldname === 'priceEvening') priceEvening = Number(part.value);
          if (part.fieldname === 'subFieldNames') subFieldNames.push(part.value);
        } else if (part.type === 'file') {
          const uploadDir = path.join(__dirname, '../public/uploads');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }

          const filename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(part.filename)}`;
          const filepath = path.join(uploadDir, filename);

          await pipeline(part.file, fs.createWriteStream(filepath));
          const relativePath = `/uploads/${filename}`;

          if (part.fieldname === 'image') {
            mainImagePath = relativePath;
          } else if (part.fieldname === 'subImages') {
            subImagePaths.push(relativePath);
          }
        }
      }

      if ((priceMorning !== undefined && priceMorning < 0) || (priceEvening !== undefined && priceEvening < 0)) {
        return reply.code(400).send({ success: false, error: 'Giá thuê sân không thể là số âm!' });
      }

      const updatedData = {};
      if (name) updatedData.name = name;
      if (type) updatedData.type = type;
      if (category) updatedData.category = category;
      if (subType) updatedData.subType = subType;
      if (location) updatedData.location = location;
      if (priceMorning !== undefined) updatedData.priceMorning = priceMorning;
      if (priceEvening !== undefined) updatedData.priceEvening = priceEvening;
      if (mainImagePath) updatedData.image = mainImagePath;
      if (subImagePaths.length > 0) updatedData.subImages = subImagePaths;

      // Cập nhật mảng sân con nếu có dữ liệu gửi lên
      if (subFieldNames.length > 0) {
        updatedData.subFields = subFieldNames
          .filter(n => n && n.trim() !== '')
          .map(subName => ({ name: subName.trim(), status: 'active' }));
      }

      const updatedYard = await Yard.findByIdAndUpdate(yardId, updatedData, { new: true });

      return reply.code(200).send({
        success: true,
        message: 'Cập nhật thông tin cơ sở và sân con thành công!',
        data: updatedYard
      });
    } catch (err) {
      console.error("LỖI SỬA SÂN:", err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });

  // 4. DELETE: Xóa sân
  fastify.delete('/api/owner/yards/:id', { preHandler: verifyOwner }, async (request, reply) => {
    try {
      const ownerId = request.user.id || request.user._id || request.user.userId;
      const yardId = request.params.id;

      const deletedYard = await Yard.findOneAndDelete({ _id: yardId, owner: ownerId });
      if (!deletedYard) {
        return reply.code(404).send({ success: false, error: 'Không tìm thấy sân hoặc bạn không có quyền xóa!' });
      }

      return reply.code(200).send({
        success: true,
        message: 'Đã xóa sân thành công!'
      });
    } catch (err) {
      console.error("LỖI XÓA SÂN:", err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
}

module.exports = ownerRoutes;