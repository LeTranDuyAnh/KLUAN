// src/routes/booking.route.js

const Yard = require('../models/yard.model');
const Booking = require('../models/booking.model');
const UserVoucher = require('../models/user-voucher.model');
const Voucher = require('../models/voucher.model');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

async function bookingRoutes(fastify, options) {

  // =========================================================
  // Middleware kiểm tra đăng nhập
  // =========================================================
  const verifyToken = async (request, reply) => {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          success: false,
          error: 'Vui lòng đăng nhập để thực hiện đặt sân!'
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
        error: 'Phiên đăng nhập đã hết hạn!'
      });
    }
  };


  // =========================================================
  // 1. GET: Render trang chi tiết sân cho khách hàng
  // =========================================================
  fastify.get('/booking/:id', async (request, reply) => {
    try {
      const yardId = request.params.id;

      const yard = await Yard
        .findById(yardId)
        .populate('owner')
        .lean();

      if (!yard) {
        return reply
          .code(404)
          .send('Không tìm thấy sân thể thao này!');
      }

      return reply.view('booking-detail.pug', {
        yard
      });

    } catch (error) {
      request.log.error(error);
      return reply
        .code(500)
        .send('Lỗi hệ thống khi tải trang chi tiết sân');
    }
  });


  // =========================================================
  // 2. GET API: Lấy các khung giờ 30 phút đã được đặt của MỘT SÂN CON trong một ngày
  // =========================================================
  fastify.get('/api/bookings/slots', async (request, reply) => {
    try {
      const {
        yardId,
        subFieldId,
        date
      } = request.query;

      if (!yardId || !subFieldId || !date) {
        return reply.code(400).send({
          success: false,
          error: 'Thiếu thông tin sân, sân con hoặc ngày!'
        });
      }

      if (
        !mongoose.Types.ObjectId.isValid(yardId) ||
        !mongoose.Types.ObjectId.isValid(subFieldId)
      ) {
        return reply.code(400).send({
          success: false,
          error: 'ID sân hoặc sân con không hợp lệ!'
        });
      }

      const existingBookings = await Booking.find({
        yard: new mongoose.Types.ObjectId(yardId),
        subFieldId: new mongoose.Types.ObjectId(subFieldId),
        date: date,
        status: {
          $in: ['chưa thanh toán', 'đã thanh toán']
        }
      }).lean();

      let bookedSlots = [];

      existingBookings.forEach(booking => {
        if (booking.slots && Array.isArray(booking.slots) && booking.slots.length > 0) {
          bookedSlots.push(...booking.slots);
        } else if (booking.startTime && booking.endTime) {
          const [startHour, startMinute] = booking.startTime.split(':').map(Number);
          const [endHour, endMinute] = booking.endTime.split(':').map(Number);

          let currentMinutes = startHour * 60 + startMinute;
          const endMinutes = endHour * 60 + endMinute;

          while (currentMinutes < endMinutes) {
            const hour = String(Math.floor(currentMinutes / 60) % 24).padStart(2, '0');
            const minute = String(currentMinutes % 60).padStart(2, '0');

            bookedSlots.push(`${hour}:${minute}`);
            currentMinutes += 30;
          }
        }
      });

      bookedSlots = [...new Set(bookedSlots)];
      bookedSlots.sort();

      return reply.send({
        success: true,
        bookedSlots
      });

    } catch (err) {
      request.log.error(err);
      return reply.code(500).send({
        success: false,
        error: 'Lỗi lấy thông tin lịch sân'
      });
    }
  });


  // =========================================================
  // 3. POST API: Lưu thông tin đặt sân cho SÂN CON cụ thể
  // =========================================================
  fastify.post(
    '/api/bookings',
    {
      preHandler: verifyToken
    },
    async (request, reply) => {
      try {
        const {
          yardId,
          subFieldId,
          date,
          slots
        } = request.body;

        const customerId =
          request.user.id ||
          request.user._id ||
          request.user.userId;

        if (
          !yardId ||
          !subFieldId ||
          !date ||
          !slots ||
          !Array.isArray(slots) ||
          slots.length === 0
        ) {
          return reply.code(400).send({
            success: false,
            error: 'Vui lòng chọn đầy đủ thông tin sân con và khung giờ!'
          });
        }

        if (
          !mongoose.Types.ObjectId.isValid(yardId) ||
          !mongoose.Types.ObjectId.isValid(subFieldId)
        ) {
          return reply.code(400).send({
            success: false,
            error: 'ID sân hoặc sân con không hợp lệ!'
          });
        }

        const yard = await Yard.findById(yardId);
        if (!yard) {
          return reply.code(404).send({
            success: false,
            error: 'Sân thể thao không tồn tại!'
          });
        }

        const subField =
          yard.subFields.id(subFieldId) ||
          yard.subFields.find(sf => sf._id.toString() === subFieldId);

        if (!subField || subField.status !== 'active') {
          return reply.code(400).send({
            success: false,
            error: 'Sân con này không tồn tại hoặc đang bảo trì!'
          });
        }

        const sortedSlots = [...slots].sort();
        const startTime = sortedSlots[0];

        const [lastH, lastM] = sortedSlots[sortedSlots.length - 1].split(':').map(Number);
        let endTotalMin = lastH * 60 + lastM + 30;

        const endH = String(Math.floor(endTotalMin / 60) % 24).padStart(2, '0');
        const endM = String(endTotalMin % 60).padStart(2, '0');
        const endTime = `${endH}:${endM}`;

        const conflictingBookings = await Booking.find({
          yard: new mongoose.Types.ObjectId(yardId),
          subFieldId: new mongoose.Types.ObjectId(subFieldId),
          date: date,
          status: {
            $in: ['chưa thanh toán', 'đã thanh toán']
          },
          startTime: { $lt: endTime },
          endTime: { $gt: startTime }
        });

        if (conflictingBookings.length > 0) {
          return reply.code(400).send({
            success: false,
            error: `Rất tiếc! Sân ${subField.name} đã có người đặt trong khung giờ ${startTime} - ${endTime}. Vui lòng chọn khung giờ khác!`
          });
        }

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

        const newBooking = await Booking.create({
          yard: yardId,
          subFieldId: subField._id,
          subFieldName: subField.name,
          customer: customerId,
          date,
          startTime,
          endTime,
          slots,
          totalPrice: totalPrice, 
          status: 'chưa thanh toán'
        });

        return reply.code(201).send({
          success: true,
          message: `Đặt thành công ${subField.name}! Tổng tiền: ${totalPrice.toLocaleString()}đ`,
          data: newBooking
        });

      } catch (err) {
        console.error('LỖI KHI ĐẶT SÂN (Exception):', err);
        return reply.code(500).send({
          success: false,
          error: err.message
        });
      }
    }
  );


  // =========================================================
  // 4. GET: Render trang danh sách toàn bộ sân
  // =========================================================
  fastify.get(
    '/booking',
    async (req, reply) => {
      try {
        return reply.view(
          'yards-list.pug',
          { activePage: 'booking' }
        );
      } catch (error) {
        req.log.error(error);
        return reply.status(500).send('Lỗi tải trang');
      }
    }
  );


  // =========================================================
  // 5. PUT API: Khách hàng xác nhận thanh toán & Áp dụng / Khóa Voucher
  // =========================================================
  fastify.put(
    '/api/customer/bookings/:id/pay',
    {
      preHandler: verifyToken
    },
    async (request, reply) => {
      try {
        const bookingId = request.params.id;
        const customerId = request.user.id || request.user._id || request.user.userId;
        const { userVoucherId } = request.body;

        const booking = await Booking.findOne({
          _id: bookingId,
          customer: customerId
        });

        if (!booking) {
          return reply.code(404).send({
            success: false,
            error: 'Không tìm thấy đơn đặt sân!'
          });
        }

        if (booking.status === 'đã thanh toán') {
          return reply.code(400).send({
            success: false,
            error: 'Đơn hàng này đã được thanh toán trước đó rồi!'
          });
        }

        let discountAmount = 0;
        let validVoucherId = null;

        if (userVoucherId) {
          const userVoucher = await UserVoucher.findOne({ 
            _id: userVoucherId, 
            userId: customerId, 
            isUsed: false 
          }).populate('voucherId');

          if (!userVoucher || !userVoucher.voucherId) {
            return reply.code(400).send({
              success: false,
              error: 'Mã giảm giá trong ví không hợp lệ hoặc đã được sử dụng rồi!'
            });
          }

          const voucher = userVoucher.voucherId;
          discountAmount = voucher.discountValue;
          if (discountAmount > booking.totalPrice) {
            discountAmount = booking.totalPrice;
          }

          validVoucherId = voucher._id;

          userVoucher.isUsed = true;
          await userVoucher.save();

          voucher.usedCount += 1;
          await voucher.save();
        }

        booking.totalPrice = Math.max(0, booking.totalPrice - discountAmount);
        booking.voucher = validVoucherId;
        booking.discountAmount = discountAmount;
        booking.status = 'đã thanh toán';
        await booking.save();

        return reply.send({
          success: true,
          message: 'Thanh toán thành công và đã khóa mã giảm giá trong ví!'
        });

      } catch (err) {
        request.log.error(err);
        return reply.code(500).send({
          success: false,
          error: 'Lỗi hệ thống khi xử lý thanh toán: ' + err.message
        });
      }
    }
  );

}

module.exports = bookingRoutes;