
const Voucher = require('../models/voucher.model');
const UserVoucher = require('../models/user-voucher.model');
const jwt = require('jsonwebtoken');

async function voucherRoutes(fastify, options) {

  // ==============================
  // KIỂM TRA ĐĂNG NHẬP
  // ==============================
  const verifyToken = async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          success: false,
          error: 'Chưa đăng nhập!'
        });
      }

      const token = authHeader.split(' ')[1];

      request.user = jwt.verify(
        token,
        process.env.JWT_SECRET || 'your_secret_key'
      );

    } catch (err) {
      return reply.code(401).send({
        success: false,
        error: 'Token không hợp lệ hoặc hết hạn!'
      });
    }
  };


  // =========================================================
  // 1. KHÁCH HÀNG LƯU VOUCHER VÀO VÍ
  // =========================================================
  fastify.post(
    '/api/vouchers/claim',
    { preHandler: verifyToken },
    async (request, reply) => {

      try {

        const { code } = request.body;

        const userId =
          request.user.id ||
          request.user._id ||
          request.user.userId;

        if (!code) {
          return reply.code(400).send({
            success: false,
            error: 'Vui lòng nhập mã voucher!'
          });
        }


        // Tìm voucher
        const voucher = await Voucher.findOne({
          code: code.toUpperCase()
        });

        if (!voucher) {
          return reply.code(404).send({
            success: false,
            error: 'Mã giảm giá không tồn tại!'
          });
        }


        // Kiểm tra thời gian
        const now = new Date();

        if (
          voucher.status !== 'active' ||
          now < new Date(voucher.startDate) ||
          now > new Date(voucher.endDate)
        ) {
          return reply.code(400).send({
            success: false,
            error: 'Mã giảm giá chưa có hiệu lực, đã hết hạn hoặc ngưng hoạt động!'
          });
        }


        // Kiểm tra số lượng sử dụng
        if (voucher.usedCount >= voucher.quantity) {
          return reply.code(400).send({
            success: false,
            error: 'Mã giảm giá đã hết lượt phát hành!'
          });
        }


        // Kiểm tra khách đã lưu voucher chưa
        const existingUserVoucher = await UserVoucher.findOne({
          userId: userId,
          voucherId: voucher._id
        });

        if (existingUserVoucher) {
          return reply.code(400).send({
            success: false,
            error: 'Bạn đã lưu mã giảm giá này trong ví rồi!'
          });
        }


        // Lưu voucher vào ví
        const newUserVoucher = await UserVoucher.create({
          userId: userId,
          voucherId: voucher._id,
          isUsed: false
        });


        return reply.send({
          success: true,
          message: 'Lưu mã giảm giá vào ví thành công!',
          userVoucherId: newUserVoucher._id
        });

      } catch (err) {

        console.error(
          '[CLAIM VOUCHER EXCEPTION]',
          err
        );

        return reply.code(500).send({
          success: false,
          error: 'Lỗi server khi lưu mã: ' + err.message
        });
      }
    }
  );


  // =========================================================
  // 2. LẤY TẤT CẢ VOUCHER CHƯA SỬ DỤNG CỦA KHÁCH HÀNG
  // =========================================================
  fastify.get(
    '/api/customer/vouchers',
    { preHandler: verifyToken },
    async (request, reply) => {

      try {

        const userId =
          request.user.id ||
          request.user._id ||
          request.user.userId;

        const now = new Date();


        // -------------------------------------------------
        // Lấy toàn bộ voucher khách đã lưu vào ví
        // nhưng CHƯA SỬ DỤNG
        // -------------------------------------------------
        const userVouchers = await UserVoucher.find({
          userId: userId,
          isUsed: false
        })
          .populate({
            path: 'voucherId',
            model: 'Voucher'
          })
          .lean();


        // -------------------------------------------------
        // Lọc những voucher còn sử dụng được
        // -------------------------------------------------
        const availableVouchers = userVouchers.filter((uv) => {

          // Không có voucher
          if (!uv.voucherId) {
            return false;
          }

          const voucher = uv.voucherId;


          // Đã sử dụng
          if (uv.isUsed === true) {
            return false;
          }


          // Voucher không active
          if (voucher.status !== 'active') {
            return false;
          }


          // Chưa đến ngày bắt đầu
          if (now < new Date(voucher.startDate)) {
            return false;
          }


          // Đã hết hạn
          if (now > new Date(voucher.endDate)) {
            return false;
          }


          // Voucher đã hết lượt
          if (voucher.usedCount >= voucher.quantity) {
            return false;
          }


          return true;
        });


        // -------------------------------------------------
        // Trả danh sách voucher cho frontend
        // -------------------------------------------------
        const result = availableVouchers.map((uv) => {

          return {
            _id: uv._id,

            userVoucherId: uv._id,

            voucherId: uv.voucherId,

            isClaimed: true,

            isUsed: false
          };

        });


        console.log(
          `[GET VOUCHERS] User ${userId}: ${result.length} voucher chưa sử dụng`
        );


        return reply.send({
          success: true,

          count: result.length,

          vouchers: result
        });


      } catch (err) {

        console.error(
          '[GET VOUCHERS EXCEPTION]',
          err
        );

        return reply.code(500).send({
          success: false,
          error: 'Lỗi lấy danh sách voucher: ' + err.message
        });

      }

    }
  );


  // =========================================================
  // 3. KIỂM TRA / ÁP DỤNG VOUCHER
  // =========================================================
  fastify.post(
    '/api/vouchers/apply',
    { preHandler: verifyToken },
    async (request, reply) => {

      try {

        const {
          userVoucherId,
          orderAmount
        } = request.body;

        const userId =
          request.user.id ||
          request.user._id ||
          request.user.userId;


        if (
          !userVoucherId ||
          orderAmount === undefined
        ) {

          return reply.code(400).send({
            success: false,
            error: 'Thiếu thông tin áp dụng mã!'
          });

        }


        // -------------------------------------------------
        // Tìm voucher của chính khách hàng
        // -------------------------------------------------
        const userVoucher = await UserVoucher.findOne({
          _id: userVoucherId,
          userId: userId,
          isUsed: false
        })
          .populate({
            path: 'voucherId',
            model: 'Voucher'
          });


        if (!userVoucher) {

          return reply.code(404).send({
            success: false,
            error: 'Voucher không tồn tại hoặc đã được sử dụng!'
          });

        }


        const voucher = userVoucher.voucherId;


        if (!voucher) {

          return reply.code(404).send({
            success: false,
            error: 'Thông tin voucher không tồn tại!'
          });

        }


        const now = new Date();


        // -------------------------------------------------
        // Kiểm tra voucher
        // -------------------------------------------------
        if (voucher.status !== 'active') {

          return reply.code(400).send({
            success: false,
            error: 'Voucher hiện không hoạt động!'
          });

        }


        if (now < new Date(voucher.startDate)) {

          return reply.code(400).send({
            success: false,
            error: 'Voucher chưa đến thời gian sử dụng!'
          });

        }


        if (now > new Date(voucher.endDate)) {

          return reply.code(400).send({
            success: false,
            error: 'Voucher đã hết hạn!'
          });

        }


        if (voucher.usedCount >= voucher.quantity) {

          return reply.code(400).send({
            success: false,
            error: 'Voucher đã hết lượt sử dụng!'
          });

        }


        // -------------------------------------------------
        // Tính giảm giá
        // -------------------------------------------------
        let discount = Number(voucher.discountValue) || 0;

        const amount = Number(orderAmount) || 0;


        // Không cho giảm quá số tiền thanh toán
        if (discount > amount) {
          discount = amount;
        }


        const finalAmount = amount - discount;


        return reply.send({

          success: true,

          message: 'Áp dụng mã thành công!',

          voucherId: voucher._id,

          userVoucherId: userVoucher._id,

          code: voucher.code,

          discountAmount: discount,

          originalAmount: amount,

          finalAmount: finalAmount

        });


      } catch (err) {

        console.error(
          '[APPLY VOUCHER EXCEPTION]',
          err
        );

        return reply.code(500).send({
          success: false,
          error: 'Lỗi server khi áp dụng mã: ' + err.message
        });

      }

    }
  );

}

module.exports = voucherRoutes;
