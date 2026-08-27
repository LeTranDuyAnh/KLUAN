//- src/routes/customer.route.js
const Booking = require('../models/booking.model');
const jwt = require('jsonwebtoken');

// Middleware xác thực token của khách hàng
const verifyToken = async (request, reply) => {
  try {
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ success: false, error: 'Chưa đăng nhập!' });
    }
    const token = authHeader.split(' ')[1];
    request.user = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
  } catch (err) {
    return reply.code(401).send({ success: false, error: 'Token không hợp lệ hoặc hết hạn!' });
  }
};

async function customerRoutes(fastify, options) {

  // 1. Route render giao diện trang lịch sử đặt sân của khách
  fastify.get('/customer/my-bookings', async (request, reply) => {
    return reply.view('customer-bookings.pug');
  });

  // 2. API lấy danh sách lịch sử đặt sân của user đang đăng nhập
  fastify.get('/api/customer/bookings', { preHandler: verifyToken }, async (request, reply) => {
    try {
      const customerId = request.user.id || request.user._id || request.user.userId;
      
      const bookings = await Booking.find({ customer: customerId })
        .populate('yard', 'name location image type priceMorning priceEvening')
        .sort({ createdAt: -1 });

      return reply.send({ success: true, bookings });
    } catch (error) {
      console.error(error);
      return reply.code(500).send({ success: false, error: 'Lỗi server khi lấy lịch sử đặt sân' });
    }
  });

  // 3. API khách hàng hủy lịch đặt (chỉ khi ở trạng thái pending)
  fastify.patch('/api/customer/bookings/:id/cancel', { preHandler: verifyToken }, async (request, reply) => {
    try {
      const bookingId = request.params.id;
      const customerId = request.user.id || request.user._id || request.user.userId;

      const booking = await Booking.findOne({ _id: bookingId, customer: customerId });
      if (!booking) {
        return reply.code(404).send({ success: false, error: 'Không tìm thấy lịch đặt sân!' });
      }

      if (booking.status !== 'pending') {
        return reply.code(400).send({ success: false, error: 'Chỉ có thể hủy lịch khi đang chờ duyệt (pending)!' });
      }

      booking.status = 'cancelled';
      await booking.save();

      return reply.send({ success: true, message: 'Đã hủy lịch đặt sân thành công!' });
    } catch (error) {
      console.error(error);
      return reply.code(500).send({ success: false, error: 'Lỗi server' });
    }
  });
}

module.exports = customerRoutes;