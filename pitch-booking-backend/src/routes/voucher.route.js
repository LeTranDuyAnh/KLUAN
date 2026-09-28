const Voucher = require('../models/voucher.model');
const UserVoucher = require('../models/user-voucher.model');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

async function voucherRoutes(fastify, options) {

  // Middleware xác thực token nhanh
  const verifyToken = async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('[AUTH ERROR] Không tìm thấy hoặc sai định dạng Authorization Header');
        return reply.code(401).send({ success: false, error: 'Chưa đăng nhập!' });
      }
      const token = authHeader.split(' ')[1];
      request.user = jwt.verify(token, process.env.JWT_SECRET || 'your_secret_key');
    } catch (err) {
      console.log('[AUTH ERROR] Lỗi xác thực Token:', err.message);
      return reply.code(401).send({ success: false, error: 'Token không hợp lệ hoặc hết hạn!' });
    }
  };

  // 1. API cho User lưu/sưu tầm mã voucher vào ví cá nhân bằng mã code (Đã chặn lưu trùng lặp)
  fastify.post('/api/vouchers/claim', { preHandler: verifyToken }, async (request, reply) => {
    try {
      const { code } = request.body;
      const userId = request.user.id || request.user._id || request.user.userId;

      console.log(`[CLAIM VOUCHER] User ${userId} đang thử lưu mã: "${code}"`);

      if (!code) {
        console.log('[CLAIM VOUCHER] Thất bại: Thiếu mã voucher');
        return reply.code(400).send({ success: false, error: 'Vui lòng nhập mã voucher!' });
      }

      const voucher = await Voucher.findOne({ code: code.toUpperCase() });
      if (!voucher) {
        console.log(`[CLAIM VOUCHER] Thất bại: Không tìm thấy mã "${code}" trong Database`);
        return reply.code(404).send({ success: false, error: 'Mã giảm giá không tồn tại!' });
      }

      console.log('[CLAIM VOUCHER] Tìm thấy Voucher trong DB:', voucher);

      // Kiểm tra hạn, ngày bắt đầu và trạng thái
      const now = new Date();
      console.log(`[TIME CHECK] Thời gian hiện tại: ${now}, StartDate: ${voucher.startDate}, EndDate: ${voucher.endDate}`);

      if (
        voucher.status !== 'active' || 
        now < new Date(voucher.startDate) || 
        now > new Date(voucher.endDate)
      ) {
        console.log('[CLAIM VOUCHER] Thất bại: Mã chưa tới hạn, đã hết hạn hoặc ngưng hoạt động');
        return reply.code(400).send({ success: false, error: 'Mã giảm giá chưa có hiệu lực, đã hết hạn hoặc ngưng hoạt động!' });
      }

      if (voucher.usedCount >= voucher.quantity) {
        console.log('[CLAIM VOUCHER] Thất bại: Mã đã hết số lượng phát hành');
        return reply.code(400).send({ success: false, error: 'Mã giảm giá đã hết lượt phát hành!' });
      }

      // Kiểm tra xem user này đã sở hữu voucher này trong ví (UserVoucher) chưa
      const existingUserVoucher = await UserVoucher.findOne({ 
        userId: userId, 
        voucherId: voucher._id 
      });

      if (existingUserVoucher) {
        console.log('[CLAIM VOUCHER] Thất bại: User đã sở hữu mã này trong ví rồi');
        return reply.code(400).send({ success: false, error: 'Bạn đã lưu mã giảm giá này trong ví rồi, không thể lưu lại lần nữa!' });
      }

      // Thêm vào bảng user_vouchers
      const newUserVoucher = await UserVoucher.create({
        userId,
        voucherId: voucher._id,
        isUsed: false
      });

      console.log('[CLAIM VOUCHER] Thành công! Đã thêm vào ví:', newUserVoucher);
      return reply.send({ success: true, message: 'Lưu mã giảm giá vào ví thành công!' });
    } catch (err) {
      console.error('[CLAIM VOUCHER EXCEPTION]', err);
      return reply.code(500).send({ success: false, error: 'Lỗi server khi lưu mã: ' + err.message });
    }
  });

  // 2. API lấy danh sách voucher có trong ví của User đang đăng nhập (Chỉ lấy mã chưa dùng)
  fastify.get('/api/customer/vouchers', { preHandler: verifyToken }, async (request, reply) => {
    try {
      const userId = request.user.id || request.user._id || request.user.userId;
      console.log(`[GET VOUCHERS] Đang lấy danh sách voucher trong ví của User: ${userId}`);

      const myVouchers = await UserVoucher.find({ userId, isUsed: false })
        .populate('voucherId')
        .sort({ assignedAt: -1 });

      console.log(`[GET VOUCHERS] Thành công! Tìm thấy ${myVouchers.length} mã chưa sử dụng trong ví.`);
      return reply.send({ success: true, vouchers: myVouchers });
    } catch (err) {
      console.error('[GET VOUCHERS EXCEPTION]', err);
      return reply.code(500).send({ success: false, error: 'Lỗi lấy danh sách voucher: ' + err.message });
    }
  });

  // 3. API Kiểm tra và áp dụng voucher khi đặt sân (Đã cập nhật khóa mã sau khi dùng)
  fastify.post('/api/vouchers/apply', { preHandler: verifyToken }, async (request, reply) => {
    try {
      const { userVoucherId, orderAmount } = request.body; 
      const userId = request.user.id || request.user._id || request.user.userId;

      console.log(`[APPLY VOUCHER] User ${userId} áp dụng userVoucherId: ${userVoucherId} cho đơn hàng ${orderAmount}đ`);

      if (!userVoucherId || orderAmount === undefined) {
        console.log('[APPLY VOUCHER] Thất bại: Thiếu userVoucherId hoặc orderAmount');
        return reply.code(400).send({ success: false, error: 'Thiếu thông tin áp dụng mã!' });
      }

      const userVoucher = await UserVoucher.findOne({ _id: userVoucherId, userId }).populate('voucherId');
      if (!userVoucher || userVoucher.isUsed) {
        console.log('[APPLY VOUCHER] Thất bại: Không tìm thấy bản ghi userVoucher hoặc đã bị đánh dấu isUsed = true');
        return reply.code(404).send({ success: false, error: 'Mã giảm giá trong ví không hợp lệ hoặc đã được sử dụng rồi!' });
      }

      const voucher = userVoucher.voucherId;
      if (!voucher) {
        console.log('[APPLY VOUCHER] Thất bại: Không tìm thấy thông tin voucher gốc liên kết');
        return reply.code(404).send({ success: false, error: 'Thông tin mã giảm giá không tồn tại!' });
      }

      const now = new Date();
      console.log(`[APPLY TIME CHECK] Hiện tại: ${now} | Start: ${voucher.startDate} | End: ${voucher.endDate}`);

      if (
        voucher.status !== 'active' || 
        now < new Date(voucher.startDate) || 
        now > new Date(voucher.endDate)
      ) {
        console.log('[APPLY VOUCHER] Thất bại: Mã đã hết hạn hoặc chưa tới thời gian áp dụng');
        return reply.code(400).send({ success: false, error: 'Mã giảm giá đã hết hạn hoặc chưa có hiệu lực!' });
      }

      // Xử lý tính toán loại giảm giá (fixed hoặc percentage)
      let discount = 0;
      if (voucher.discountType === 'fixed') {
        discount = voucher.discountValue;
        console.log(`[CALC DISCOUNT] Kiểu: Cố định (fixed) -> Giảm: ${discount}đ`);
      } else if (voucher.discountType === 'percentage') {
        discount = (orderAmount * voucher.discountValue) / 100;
        console.log(`[CALC DISCOUNT] Kiểu: Phần trăm (${voucher.discountValue}%) -> Tạm tính giảm: ${discount}đ`);
        
        if (voucher.maxDiscountAmount && discount > voucher.maxDiscountAmount) {
          discount = voucher.maxDiscountAmount;
          console.log(`[CALC DISCOUNT] Vượt mức tối đa, áp dụng mức giảm tối đa (maxDiscountAmount): ${discount}đ`);
        }
      }

      if (discount > orderAmount) {
        discount = orderAmount;
      }

      // === [THÊM LOGIC KHÓA MÃ TẠI ĐÂY]: Đánh dấu mã trong ví đã được sử dụng ===
      userVoucher.isUsed = true;
      await userVoucher.save();

      // Tăng số lượng đã dùng (usedCount) của voucher gốc lên 1
      await Voucher.findByIdAndUpdate(voucher._id, { $inc: { usedCount: 1 } });

      console.log(`[APPLY VOUCHER SUCCESS] Áp dụng và khóa mã thành công! Giảm: ${discount}đ. Thành tiền: ${orderAmount - discount}đ`);

      return reply.send({
        success: true,
        message: 'Áp dụng mã thành công!',
        discountAmount: discount,
        finalAmount: orderAmount - discount,
        voucherId: voucher._id
      });

    } catch (err) {
      console.error('[APPLY VOUCHER EXCEPTION]', err);
      return reply.code(500).send({ success: false, error: 'Lỗi server khi áp dụng mã: ' + err.message });
    }
  });

}

module.exports = voucherRoutes;