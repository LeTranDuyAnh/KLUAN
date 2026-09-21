//- src/routes/booking.route.js
const Yard = require('../models/yard.model');
const Booking = require('../models/booking.model');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose'); // Đảm bảo đã khai báo mongoose

async function bookingRoutes(fastify, options) {

  // Middleware kiểm tra đăng nhập
  const verifyToken = async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({ success: false, error: 'Vui lòng đăng nhập để thực hiện đặt sân!' });
      }
      const token = authHeader.split(' ')[1];
      request.user = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    } catch (err) {
      return reply.code(401).send({ success: false, error: 'Phiên đăng nhập đã hết hạn!' });
    }
  };

  // 1. GET: Render trang chi tiết sân cho khách hàng
  fastify.get('/booking/:id', async (request, reply) => {
    try {
      const yardId = request.params.id;
      const yard = await Yard.findById(yardId).populate('owner').lean();
      
      if (!yard) {
        return reply.code(404).send('Không tìm thấy sân thể thao này!');
      }

      return reply.view('booking-detail.pug', { yard });
    } catch (error) {
      request.log.error(error);
      return reply.code(500).send('Lỗi hệ thống khi tải trang chi tiết sân');
    }
  });

  // 2. GET API: Lấy các khung giờ 30 phút đã được đặt của MỘT SÂN CON cụ thể trong ngày
  fastify.get('/api/bookings/slots', async (request, reply) => {
    try {
      const { yardId, subFieldId, date } = request.query;
      if (!yardId || !subFieldId || !date) {
        return reply.code(400).send({ success: false, error: 'Thiếu thông tin sân, sân con hoặc ngày!' });
      }

      const existingBookings = await Booking.find({
        yard: new mongoose.Types.ObjectId(yardId),
        subFieldId: new mongoose.Types.ObjectId(subFieldId),
        date: date,
        status: { $in: ['pending', 'confirmed'] }
      }).lean();

      let bookedSlots = [];
      existingBookings.forEach(b => {
        if (b.slots && Array.isArray(b.slots)) {
          bookedSlots = bookedSlots.concat(b.slots);
        }
      });

      return { success: true, bookedSlots };
    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({ success: false, error: 'Lỗi lấy thông tin lịch sân' });
    }
  });

  // 3. POST API: Lưu thông tin đặt sân cho SÂN CON cụ thể
  fastify.post('/api/bookings', { preHandler: verifyToken }, async (request, reply) => {
    try {
      console.log('--- [DEBUG] NHẬN REQUEST ĐẶT SÂN ---');
      console.log('Request Body:', request.body);

      const { yardId, subFieldId, date, slots } = request.body; 
      const customerId = request.user.id || request.user._id || request.user.userId;

      if (!yardId || !subFieldId || !date || !slots || !Array.isArray(slots) || slots.length === 0) {
        console.log('[DEBUG] Lỗi: Thiếu thông tin bắt buộc trong request body!');
        return reply.code(400).send({ success: false, error: 'Vui lòng chọn đầy đủ thông tin sân con và khung giờ!' });
      }

      // 1. Tìm cụm sân tổng
      const yard = await Yard.findById(yardId);
      if (!yard) {
        console.log('[DEBUG] Lỗi: Không tìm thấy Yard với ID:', yardId);
        return reply.code(404).send({ success: false, error: 'Sân thể thao không tồn tại!' });
      }

      // 2. Tìm chính xác sân con bên trong mảng subFields của Yard
      const subField = yard.subFields.id(subFieldId) || yard.subFields.find(sf => sf._id.toString() === subFieldId);
      if (!subField || subField.status !== 'active') {
        console.log('[DEBUG] Lỗi: Sân con không tồn tại hoặc bảo trì. subFieldId:', subFieldId);
        return reply.code(400).send({ success: false, error: 'Sân con này không tồn tại hoặc đang bảo trì!' });
      }

      console.log(`[DEBUG] Đang kiểm tra trùng lịch cho Sân: ${subField.name} (ID: ${subField._id}), Ngày: ${date}`);
      console.log('[DEBUG] Các slots khách yêu cầu:', slots);

      // 3. KIỂM TRA TRÙNG LỊCH NGHIÊM NGẶT (Ép kiểu ObjectId để khớp tuyệt đối với DB)
      const conflictingBookings = await Booking.find({
        yard: new mongoose.Types.ObjectId(yardId),
        subFieldId: new mongoose.Types.ObjectId(subField._id),
        date: date,
        status: { $in: ['pending', 'confirmed'] },
        slots: { $in: slots }
      });

      console.log('[DEBUG] Số lượng đơn hàng trùng lặp tìm thấy:', conflictingBookings.length);
      if (conflictingBookings.length > 0) {
        console.log('[DEBUG] Chi tiết các đơn trùng:', conflictingBookings.map(b => ({ id: b._id, slots: b.slots, status: b.status })));
        return reply.code(400).send({ 
          success: false, 
          error: `Rất tiếc! Sân ${subField.name} vừa có người khác đặt trong khung giờ này. Vui lòng chọn lại!` 
        });
      }

      // 4. Tính tiền tự động dựa trên từng ô 30 phút
      let totalPrice = 0;
      const blockMorningRate = (yard.priceMorning || 0) / 2;
      const blockEveningRate = (yard.priceEvening || 0) / 2;

      slots.forEach(slotTime => {
        const [h] = slotTime.split(':').map(Number);
        if (h >= 5 && h < 18) {
          totalPrice += blockMorningRate;
        } else {
          totalPrice += blockEveningRate;
        }
      });

      // 5. Gán startTime và endTime từ slot đầu và slot cuối
      const sortedSlots = [...slots].sort();
      const startTime = sortedSlots[0];
      
      const [lastH, lastM] = sortedSlots[sortedSlots.length - 1].split(':').map(Number);
      let endTotalMin = lastH * 60 + lastM + 30;
      const endH = String(Math.floor(endTotalMin / 60) % 24).padStart(2, '0');
      const endM = String(endTotalMin % 60).padStart(2, '0');
      const endTime = `${endH}:${endM}`;

      // 6. Tạo booking mới
      const newBooking = await Booking.create({
        yard: yardId,
        subFieldId: subField._id,
        subFieldName: subField.name,
        customer: customerId,
        date,
        startTime,
        endTime,
        slots, 
        totalPrice,
        status: 'pending'
      });

      console.log('[DEBUG] Tạo đơn thành công! Booking ID:', newBooking._id);

      return reply.code(201).send({
        success: true,
        message: `Đặt thành công ${subField.name}! Tổng tiền: ${totalPrice.toLocaleString()}đ`,
        data: newBooking
      });

    } catch (err) {
      console.error('LỖI KHI ĐẶT SÂN (Exception):', err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
  
  // GET: Render trang danh sách toàn bộ sân cho khách hàng
  fastify.get('/booking', async (req, reply) => {
    try {
      return reply.view('yards-list.pug', { activePage: 'booking' });
    } catch (error) {
      req.log.error(error);
      return reply.status(500).send('Lỗi tải trang');
    }
  });

}

module.exports = bookingRoutes;