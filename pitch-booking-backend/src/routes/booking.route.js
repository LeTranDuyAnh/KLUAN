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
          error: 'Vui lòng đăng nhập để thực hiện thao tác!'
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
  // 2. GET API:
  // Lấy các khung giờ 30 phút đã được đặt
  // của MỘT SÂN CON trong một ngày
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
          $in: [
            'chưa thanh toán',
            'đã thanh toán'
          ]
        }

      }).lean();


      let bookedSlots = [];


      existingBookings.forEach(booking => {

        // Nếu DB đã lưu slots
        if (
          booking.slots &&
          Array.isArray(booking.slots) &&
          booking.slots.length > 0
        ) {

          bookedSlots.push(...booking.slots);

        }

        // Nếu DB chỉ có startTime/endTime
        else if (
          booking.startTime &&
          booking.endTime
        ) {

          const [startHour, startMinute] =
            booking.startTime.split(':').map(Number);

          const [endHour, endMinute] =
            booking.endTime.split(':').map(Number);


          let currentMinutes =
            startHour * 60 + startMinute;

          const endMinutes =
            endHour * 60 + endMinute;


          while (currentMinutes < endMinutes) {

            const hour = String(
              Math.floor(currentMinutes / 60) % 24
            ).padStart(2, '0');

            const minute = String(
              currentMinutes % 60
            ).padStart(2, '0');

            bookedSlots.push(`${hour}:${minute}`);

            currentMinutes += 30;
          }
        }
      });


      // Xóa slot trùng
      bookedSlots = [
        ...new Set(bookedSlots)
      ];

      // Sắp xếp
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
  // 3. POST API:
  // Đặt sân con
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


        // Lấy ID người dùng
        const customerId =
          request.user.id ||
          request.user._id ||
          request.user.userId;


        // Kiểm tra dữ liệu
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


        // Kiểm tra ObjectId
        if (
          !mongoose.Types.ObjectId.isValid(yardId) ||
          !mongoose.Types.ObjectId.isValid(subFieldId)
        ) {

          return reply.code(400).send({
            success: false,
            error: 'ID sân hoặc sân con không hợp lệ!'
          });
        }


        // Tìm sân
        const yard = await Yard.findById(yardId);

        if (!yard) {

          return reply.code(404).send({
            success: false,
            error: 'Sân thể thao không tồn tại!'
          });
        }


        // Tìm sân con
        const subField =
          yard.subFields.id(subFieldId) ||
          yard.subFields.find(
            sf => sf._id.toString() === subFieldId
          );


        if (
          !subField ||
          subField.status !== 'active'
        ) {

          return reply.code(400).send({
            success: false,
            error: 'Sân con này không tồn tại hoặc đang bảo trì!'
          });
        }


        // =====================================================
        // Tính giờ bắt đầu / kết thúc
        // =====================================================

        const sortedSlots = [
          ...slots
        ].sort();

        const startTime =
          sortedSlots[0];


        const [
          lastH,
          lastM
        ] = sortedSlots[
          sortedSlots.length - 1
        ]
          .split(':')
          .map(Number);


        let endTotalMin =
          lastH * 60 +
          lastM +
          30;


        const endH = String(
          Math.floor(endTotalMin / 60) % 24
        ).padStart(2, '0');


        const endM = String(
          endTotalMin % 60
        ).padStart(2, '0');


        const endTime =
          `${endH}:${endM}`;


        // =====================================================
        // Kiểm tra trùng lịch
        // =====================================================

        const conflictingBookings =
          await Booking.find({

            yard:
              new mongoose.Types.ObjectId(yardId),

            subFieldId:
              new mongoose.Types.ObjectId(subFieldId),

            date: date,

            status: {
              $in: [
                'chưa thanh toán',
                'đã thanh toán'
              ]
            },

            startTime: {
              $lt: endTime
            },

            endTime: {
              $gt: startTime
            }

          });


        if (
          conflictingBookings.length > 0
        ) {

          return reply.code(400).send({

            success: false,

            error:
              `Rất tiếc! Sân ${subField.name} đã có người đặt trong khung giờ ${startTime} - ${endTime}. Vui lòng chọn khung giờ khác!`

          });
        }


        // =====================================================
        // Tính tiền
        // =====================================================

        let totalPrice = 0;


        const blockMorningRate =
          (yard.priceMorning || 0) / 2;


        const blockEveningRate =
          (yard.priceEvening || 0) / 2;


        slots.forEach(slotTime => {

          const [h] =
            slotTime
              .split(':')
              .map(Number);


          if (
            h >= 5 &&
            h < 18
          ) {

            totalPrice +=
              blockMorningRate;

          } else {

            totalPrice +=
              blockEveningRate;
          }

        });


        // =====================================================
        // Tạo booking
        // =====================================================

        const newBooking =
          await Booking.create({

            yard: yardId,

            subFieldId:
              subField._id,

            subFieldName:
              subField.name,

            customer:
              customerId,

            date,

            startTime,

            endTime,

            slots,

            totalPrice,

            status:
              'chưa thanh toán'

          });


        return reply.code(201).send({

          success: true,

          message:
            `Đặt thành công ${subField.name}! Tổng tiền: ${totalPrice.toLocaleString()}đ`,

          data:
            newBooking

        });


      } catch (err) {

        console.error(
          'LỖI KHI ĐẶT SÂN (Exception):',
          err
        );

        return reply.code(500).send({

          success: false,

          error: err.message

        });
      }
    }
  );


  // =========================================================
  // 4. GET:
  // Render trang danh sách toàn bộ sân
  // =========================================================
  fastify.get(
    '/booking',
    async (req, reply) => {

      try {

        return reply.view(
          'yards-list.pug',
          {
            activePage: 'booking'
          }
        );

      } catch (error) {

        req.log.error(error);

        return reply
          .status(500)
          .send('Lỗi tải trang');
      }
    }
  );


  // =========================================================
  // 5. PUT API:
  // Khách hàng thanh toán booking
  // + Áp dụng voucher
  // + Đánh dấu UserVoucher đã sử dụng
  // + Tăng usedCount
  // =========================================================
  fastify.put(
    '/api/customer/bookings/:id/pay',
    {
      preHandler: verifyToken
    },
    async (request, reply) => {

      try {

        const bookingId =
          request.params.id;


        const customerId =
          request.user.id ||
          request.user._id ||
          request.user.userId;


        const {
          userVoucherId
        } = request.body || {};


        // =====================================================
        // Kiểm tra Booking
        // =====================================================

        if (
          !mongoose.Types.ObjectId.isValid(
            bookingId
          )
        ) {

          return reply.code(400).send({

            success: false,

            error:
              'ID đơn đặt sân không hợp lệ!'

          });
        }


        const booking =
          await Booking.findOne({

            _id:
              bookingId,

            customer:
              customerId

          });


        if (!booking) {

          return reply.code(404).send({

            success: false,

            error:
              'Không tìm thấy đơn đặt sân!'

          });
        }


        // =====================================================
        // Kiểm tra trạng thái thanh toán
        // =====================================================

        if (
          booking.status ===
          'đã thanh toán'
        ) {

          return reply.code(400).send({

            success: false,

            error:
              'Đơn hàng này đã được thanh toán trước đó rồi!'

          });
        }


        // =====================================================
        // Mặc định không giảm giá
        // =====================================================

        let discountAmount = 0;

        let validVoucherId = null;


        // =====================================================
        // NẾU KHÁCH HÀNG SỬ DỤNG VOUCHER
        // =====================================================

        if (userVoucherId) {


          // ---------------------------------------------------
          // 1. Tìm voucher trong ví của user
          // ---------------------------------------------------

          const userVoucher =
            await UserVoucher
              .findOne({

                _id:
                  userVoucherId,

                userId:
                  customerId,

                isUsed:
                  false

              })
              .populate({
                path: 'voucherId',
                model: 'Voucher'
              });


          if (
            !userVoucher
          ) {

            return reply.code(400).send({

              success: false,

              error:
                'Mã giảm giá trong ví không tồn tại hoặc đã được sử dụng!'

            });
          }


          // ---------------------------------------------------
          // 2. Lấy Voucher
          // ---------------------------------------------------

          const voucher =
            userVoucher.voucherId;


          if (!voucher) {

            return reply.code(400).send({

              success: false,

              error:
                'Voucher không tồn tại trong hệ thống!'

            });
          }


          // ---------------------------------------------------
          // 3. Kiểm tra trạng thái Voucher
          // ---------------------------------------------------

          if (
            voucher.status !==
            'active'
          ) {

            return reply.code(400).send({

              success: false,

              error:
                'Voucher hiện không còn hoạt động!'

            });
          }


          // ---------------------------------------------------
          // 4. Kiểm tra thời gian Voucher
          // ---------------------------------------------------

          const now =
            new Date();


          if (
            now <
            new Date(
              voucher.startDate
            )
          ) {

            return reply.code(400).send({

              success: false,

              error:
                'Voucher chưa đến thời gian sử dụng!'

            });
          }


          if (
            now >
            new Date(
              voucher.endDate
            )
          ) {

            return reply.code(400).send({

              success: false,

              error:
                'Voucher đã hết hạn!'

            });
          }


          // ---------------------------------------------------
          // 5. Kiểm tra số lượng voucher
          // ---------------------------------------------------

          if (
            voucher.usedCount >=
            voucher.quantity
          ) {

            return reply.code(400).send({

              success: false,

              error:
                'Voucher đã hết lượt sử dụng!'

            });
          }


          // ---------------------------------------------------
          // 6. Tính số tiền giảm
          // ---------------------------------------------------

          discountAmount =
            Number(
              voucher.discountValue
            ) || 0;


          // Không cho giảm quá tiền booking
          if (
            discountAmount >
            booking.totalPrice
          ) {

            discountAmount =
              booking.totalPrice;
          }


          // Lưu ID voucher
          // Voucher._id là STRING
          validVoucherId =
            voucher._id;


          // ---------------------------------------------------
          // 7. Đánh dấu voucher của User đã dùng
          // ---------------------------------------------------

          userVoucher.isUsed =
            true;

          await userVoucher.save();


          // ---------------------------------------------------
          // 8. Tăng số lần sử dụng Voucher
          // ---------------------------------------------------

          voucher.usedCount =
            (voucher.usedCount || 0) + 1;


          // Nếu đã dùng hết quantity
          // có thể chuyển trạng thái disabled
          if (
            voucher.usedCount >=
            voucher.quantity
          ) {

            voucher.status =
              'disabled';
          }


          await voucher.save();
        }


        // =====================================================
        // 9. Tính tiền cuối cùng
        // =====================================================

        const originalPrice =
          Number(
            booking.totalPrice
          ) || 0;


        const finalPrice =
          Math.max(
            0,
            originalPrice -
            discountAmount
          );


        // =====================================================
        // 10. Cập nhật Booking
        // =====================================================

        booking.totalPrice =
          finalPrice;


        booking.voucher =
          validVoucherId;


        booking.discountAmount =
          discountAmount;


        booking.status =
          'đã thanh toán';


        await booking.save();


        // =====================================================
        // 11. Trả kết quả
        // =====================================================

        return reply.send({

          success: true,

          message:
            discountAmount > 0
              ? `Thanh toán thành công! Bạn được giảm ${discountAmount.toLocaleString()}đ.`
              : 'Thanh toán thành công!',

          data: {

            bookingId:
              booking._id,

            originalPrice,

            discountAmount,

            finalPrice,

            voucherId:
              validVoucherId

          }

        });


      } catch (err) {

        request.log.error(err);

        return reply.code(500).send({

          success: false,

          error:
            'Lỗi hệ thống khi xử lý thanh toán: ' +
            err.message

        });
      }
    }
  );

}


module.exports = bookingRoutes;