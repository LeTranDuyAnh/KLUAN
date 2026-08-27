const Facility = require('../models/facility.model');
const Booking = require('../models/booking.model');

// Hàm tính tiền tự động theo khung 15:00
function calculatePrice(startTime, endTime, morningPrice, eveningPrice) {
  const startHour = parseFloat(startTime.replace(':', '.'));
  const endHour = parseFloat(endTime.replace(':', '.'));
  const splitHour = 15.00;

  let morningHours = 0;
  let eveningHours = 0;
  let totalPrice = 0;

  if (endHour <= splitHour) {
    morningHours = endHour - startHour;
    totalPrice = morningHours * morningPrice;
  } else if (startHour >= splitHour) {
    eveningHours = endHour - startHour;
    totalPrice = eveningHours * eveningPrice;
  } else {
    morningHours = splitHour - startHour;
    eveningHours = endHour - splitHour;
    totalPrice = (morningHours * morningPrice) + (eveningHours * eveningPrice);
  }

  return { morningHours, eveningHours, totalPrice };
}

// API Tạo đơn đặt sân
async function createBooking(req, reply) {
  try {
    const { customerId, facilityId, subFieldId, date, timeSlot } = req.body;
    // timeSlot = { start: "14:00", end: "17:00" }

    // 1. Tìm thông tin cơ sở và sân con tương ứng
    const facility = await Facility.findById(facilityId);
    if (!facility) {
      return reply.code(404).send({ error: 'Không tìm thấy cơ sở sân bóng!' });
    }

    const subField = facility.subFields.find(sf => sf.subFieldId === subFieldId);
    if (!subField) {
      return reply.code(404).send({ error: 'Không tìm thấy sân con trong cơ sở này!' });
    }

    // 2. Kiểm tra trùng lịch (Double Booking Check)
    const existingBooking = await Booking.findOne({
      facilityId,
      subFieldId,
      date: new Date(date),
      bookingStatus: { $in: ['pending', 'confirmed'] },
      $or: [
        { "timeSlot.start": { $lt: timeSlot.end }, "timeSlot.end": { $gt: timeSlot.start } }
      ]
    });

    if (existingBooking) {
      return reply.code(400).send({ error: 'Khung giờ này đã có người đặt, vui lòng chọn giờ khác!' });
    }

    // 3. Tính toán tiền tự động theo Sáng / Tối
    const { morningHours, eveningHours, totalPrice } = calculatePrice(
      timeSlot.start,
      timeSlot.end,
      subField.pricing.morningPrice,
      subField.pricing.eveningPrice
    );

    // 4. Lưu đơn đặt sân
    const newBooking = new Booking({
      customerId,
      facilityId,
      subFieldId,
      sportCategory: facility.sportCategory,
      date: new Date(date),
      timeSlot,
      pricingDetails: {
        morningHoursBooked: morningHours,
        eveningHoursBooked: eveningHours,
        appliedMorningPrice: subField.pricing.morningPrice,
        appliedEveningPrice: subField.pricing.eveningPrice
      },
      totalPrice
    });

    await newBooking.save();

    return reply.code(201).send({
      message: 'Đặt sân thành công, vui lòng chuyển khoản thanh toán!',
      data: newBooking
    });

  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Lỗi server nội bộ!' });
  }
}

module.exports = { createBooking };