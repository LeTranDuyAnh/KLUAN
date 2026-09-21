const Yard = require('../models/yard.model');
const Booking = require('../models/booking.model');

// Hàm tính tiền tự động theo khung 15:00 dựa trên giá của cơ sở Yard
function calculatePrice(startTime, endTime, priceMorning, priceEvening) {
  const startHour = parseFloat(startTime.replace(':', '.'));
  const endHour = parseFloat(endTime.replace(':', '.'));
  const splitHour = 15.00;

  let morningHours = 0;
  let eveningHours = 0;
  let totalPrice = 0;

  if (endHour <= splitHour) {
    morningHours = endHour - startHour;
    totalPrice = morningHours * priceMorning;
  } else if (startHour >= splitHour) {
    eveningHours = endHour - startHour;
    totalPrice = eveningHours * priceEvening;
  } else {
    morningHours = splitHour - startHour;
    eveningHours = endHour - splitHour;
    totalPrice = (morningHours * priceMorning) + (eveningHours * priceEvening);
  }

  return totalPrice;
}

// 1. API Tạo đơn đặt sân
async function createBooking(req, reply) {
  try {
    const { yardId, subFieldId, date, slots } = req.body;
    const customerId = req.user.userId || req.user._id;

    if (!yardId || !subFieldId || !date || !slots || slots.length === 0) {
      return reply.code(400).send({ success: false, error: 'Vui lòng cung cấp đầy đủ thông tin đặt sân!' });
    }

    // 1. Tìm cụm sân tổng
    const yard = await Yard.findById(yardId);
    if (!yard) {
      return reply.code(404).send({ success: false, error: 'Không tìm thấy cơ sở sân bóng!' });
    }

    // 2. Tìm đúng sân con bên trong mảng subFields để lấy cả ID và TÊN chính xác
    const subField = yard.subFields.id(subFieldId) || yard.subFields.find(sf => sf._id.toString() === subFieldId);
    if (!subField || subField.status !== 'active') {
      return reply.code(400).send({ success: false, error: 'Sân con này không tồn tại hoặc đang bảo trì!' });
    }

    // 3. Kiểm tra trùng lịch trên subFieldId này
    const existingBooking = await Booking.findOne({
      yard: yardId,
      subFieldId: subField._id,
      date: date,
      status: { $in: ['pending', 'confirmed'] },
      slots: { $in: slots }
    });

    if (existingBooking) {
      return reply.code(400).send({ 
        success: false, 
        error: `Sân ${subField.name} đã có người đặt trong khung giờ này!` 
      });
    }

    // 4. Tính toán tổng tiền tự động theo block 30 phút
    let totalPrice = 0;
    const blockMorningRate = yard.priceMorning / 2;
    const blockEveningRate = yard.priceEvening / 2;

    slots.forEach(slot => {
      const [h] = slot.split(':').map(Number);
      if (h >= 5 && h < 18) {
        totalPrice += blockMorningRate;
      } else {
        totalPrice += blockEveningRate;
      }
    });

    // 5. Khởi tạo và lưu Booking mới (Đã có đủ subFieldId và subFieldName)
    const newBooking = new Booking({
      yard: yardId,
      subFieldId: subField._id,         // Lấy từ subField tìm được
      subFieldName: subField.name,      // Lấy tên sân con (VD: "Sân số 1") từ DB ra gán vào đây
      customer: customerId,
      date,
      slots,
      totalPrice,
      status: 'pending'
    });

    await newBooking.save();

    return reply.code(201).send({
      success: true,
      message: `Đặt thành công ${subField.name}! Vui lòng chờ chủ sân duyệt đơn.`,
      data: newBooking
    });

  } catch (error) {
    console.error('Lỗi tạo đơn đặt sân:', error);
    return reply.code(500).send({ success: false, error: error.message || 'Lỗi server nội bộ!' });
  }
}

// 2. API Lấy danh sách đơn đặt sân cho Chủ sân
async function getOwnerBookings(req, reply) {
  try {
    const ownerId = req.user.userId || req.user._id;
    
    const yards = await Yard.find({ owner: ownerId }).select('_id');
    const yardIds = yards.map(y => y._id);

    const bookings = await Booking.find({ yard: { $in: yardIds } })
      .populate('yard', 'name location type')
      .populate({
        path: 'customer',
        select: 'name phone email'
      })
      .sort({ createdAt: -1 });

    return reply.send({ success: true, data: bookings });
  } catch (error) {
    console.error('Lỗi lấy danh sách đơn:', error);
    return reply.code(500).send({ success: false, error: 'Lỗi server nội bộ khi lấy danh sách đơn!' });
  }
}

// 3. API Cập nhật trạng thái đơn (Duyệt / Từ chối)
async function updateBookingStatus(req, reply) {
  try {
    const { id } = req.params;
    const { status } = req.body; 

    const booking = await Booking.findById(id);
    if (!booking) {
      return reply.code(404).send({ success: false, error: 'Không tìm thấy đơn đặt sân!' });
    }

    booking.status = status;
    await booking.save();

    return reply.send({ 
      success: true, 
      message: 'Cập nhật trạng thái đơn thành công!', 
      data: booking 
    });
  } catch (error) {
    console.error('Lỗi cập nhật trạng thái:', error);
    return reply.code(500).send({ success: false, error: 'Lỗi server nội bộ khi cập nhật trạng thái!' });
  }
}

module.exports = { 
  createBooking, 
  getOwnerBookings, 
  updateBookingStatus 
};