//- src/routes/booking.route.js
const Yard = require('../models/yard.model');
const Booking = require('../models/booking.model');
const jwt = require('jsonwebtoken');

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
  // 1. GET: Render trang chi tiết sân cho khách hàng (Đã cập nhật hỗ trợ lấy thông tin chủ sân)
  fastify.get('/booking/:id', async (request, reply) => {
    try {
      const yardId = request.params.id;
      // Dùng .populate('owner') nếu collection Yard có liên kết tới User, hoặc bỏ .populate nếu lưu trực tiếp ownerName/phone trong Yard
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

  // 2. GET API: Lấy các khung giờ 30 phút đã được đặt của sân trong 1 ngày cụ thể
  fastify.get('/api/bookings/slots', async (request, reply) => {
    try {
      const { yardId, date } = request.query;
      if (!yardId || !date) {
        return reply.code(400).send({ success: false, error: 'Thiếu thông tin sân hoặc ngày!' });
      }

      // Lấy tất cả các booking không bị hủy trong ngày đó của sân
      const existingBookings = await Booking.find({
        yard: yardId,
        date: date,
        status: { $ne: 'cancelled' }
      }).lean();

      // Tổng hợp tất cả các slot 30 phút đã bị chiếm dụng
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

  // 3. POST API: Lưu thông tin đặt sân theo danh sách các ô 30 phút khách chọn
  fastify.post('/api/bookings', { preHandler: verifyToken }, async (request, reply) => {
    try {
      const { yardId, date, slots } = request.body; // slots là mảng chuỗi giờ, ví dụ: ["07:00", "07:30", "08:00"]
      const customerId = request.user.id || request.user._id || request.user.userId;

      const yard = await Yard.findById(yardId);
      if (!yard) {
        return reply.code(404).send({ success: false, error: 'Sân thể thao không tồn tại!' });
      }

      if (!date || !slots || !Array.isArray(slots) || slots.length === 0) {
        return reply.code(400).send({ success: false, error: 'Vui lòng chọn ít nhất một khung giờ!' });
      }

      // BƯỚC KIỂM TRA TRÙNG LỊCH (CHẶN DỮ LIỆU ĐÈ LÊN NHAU)
      const conflictingBookings = await Booking.find({
        yard: yardId,
        date: date,
        status: { $ne: 'cancelled' },
        slots: { $in: slots }
      });

      if (conflictingBookings.length > 0) {
        return reply.code(400).send({ 
          success: false, 
          error: 'Một số khung giờ bạn chọn vừa có người khác đặt. Vui lòng chọn lại khung giờ trống!' 
        });
      }

      // Tính tiền tự động dựa trên từng ô 30 phút (Ca sáng: 05:00 - 18:00, Ca tối: 18:00 - 05:00)
      let totalPrice = 0;
      const blockMorningRate = (yard.priceMorning || 0) / 2;
      const blockEveningRate = (yard.priceEvening || 0) / 2;

      slots.forEach(slotTime => {
        const [h] = slotTime.split(':').map(Number);
        // Từ 05:00 đến 17:30 là ca sáng, từ 18:00 đến 04:30 sáng hôm sau là ca tối
        if (h >= 5 && h < 18) {
          totalPrice += blockMorningRate;
        } else {
          totalPrice += blockEveningRate;
        }
      });

      // Gán startTime và endTime từ slot đầu và slot cuối để tương thích với lịch sử đơn hàng cũ
      const sortedSlots = [...slots].sort();
      const startTime = sortedSlots[0];
      
      // Tính giờ kết thúc của slot cuối cộng thêm 30 phút
      const [lastH, lastM] = sortedSlots[sortedSlots.length - 1].split(':').map(Number);
      let endTotalMin = lastH * 60 + lastM + 30;
      const endH = String(Math.floor(endTotalMin / 60) % 24).padStart(2, '0');
      const endM = String(endTotalMin % 60).padStart(2, '0');
      const endTime = `${endH}:${endM}`;

      // Tạo booking mới
      const newBooking = await Booking.create({
        yard: yardId,
        customer: customerId,
        date,
        startTime,
        endTime,
        slots, // Lưu mảng các slot để quản lý chính xác từng ô
        totalPrice,
        status: 'pending'
      });

      return reply.code(201).send({
        success: true,
        message: `Gửi yêu cầu đặt sân thành công! Tổng tiền: ${totalPrice.toLocaleString()}đ`,
        data: newBooking
      });

    } catch (err) {
      console.error('LỖI KHI ĐẶT SÂN:', err);
      return reply.code(500).send({ success: false, error: err.message });
    }
  });
  
  // GET: Render trang danh sách toàn bộ sân cho khách hàng tại đường dẫn /booking
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