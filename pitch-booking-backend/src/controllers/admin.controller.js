const User = require('../models/user.model');
const bcrypt = require('bcrypt'); // Dùng để mã hóa mật khẩu khi tạo user

// 1. Lấy danh sách toàn bộ người dùng / chủ sân (Có thể lọc theo role)
async function getUsers(req, reply) {
  try {
    const { role } = req.query; // Ví dụ: /api/admin/users?role=owner
    const filter = role ? { role } : {};
    
    const users = await User.find(filter).select('-passwordHash'); // Ẩn mật khẩu khi trả về
    return reply.code(200).send({ success: true, data: users });
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Lỗi server nội bộ khi lấy danh sách người dùng!' });
  }
}

// 2. Admin tạo mới một tài khoản (có thể tạo trực tiếp chủ sân hoặc khách hàng)
async function createUserByAdmin(req, reply) {
  try {
    const { name, email, password, phone, role } = req.body;

    // Kiểm tra email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return reply.code(400).send({ error: 'Email này đã được sử dụng bởi tài khoản khác!' });
    }

    // Mã hóa mật khẩu
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const newUser = new User({
      name,
      email,
      passwordHash,
      phone,
      role: role || 'customer' // Mặc định là customer nếu không truyền
    });

    await newUser.save();

    // Ẩn mật khẩu trước khi trả về response
    const userResponse = newUser.toObject();
    delete userResponse.passwordHash;

    return reply.code(201).send({
      message: 'Tạo tài khoản thành công!',
      data: userResponse
    });
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Lỗi server nội bộ!' });
  }
}

// 3. Cập nhật thông tin / quyền của người dùng hoặc chủ sân
async function updateUser(req, reply) {
  try {
    const { id } = req.params;
    const { name, phone, role } = req.body;

    const updatedUser = await User.findByIdAndUpdate(
      id,
      { name, phone, role },
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!updatedUser) {
      return reply.code(404).send({ error: 'Không tìm thấy người dùng!' });
    }

    return reply.code(200).send({
      message: 'Cập nhật thông tin thành công!',
      data: updatedUser
    });
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Lỗi server nội bộ!' });
  }
}

// 4. Xóa người dùng / chủ sân
async function deleteUser(req, reply) {
  try {
    const { id } = req.params;

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return reply.code(404).send({ error: 'Không tìm thấy người dùng cần xóa!' });
    }

    return reply.code(200).send({
      message: 'Đã xóa tài khoản thành công!'
    });
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Lỗi server nội bộ!' });
  }
}

// 5. [BỔ SUNG] Lấy danh sách user từ DB để render trực tiếp ra trang giao diện /admin
async function getAdminPageData(req, reply) {
  try {
    const users = await User.find({}).select('-passwordHash').lean();
    return users;
  } catch (error) {
    console.error(error);
    return [];
  }
}

module.exports = {
  getUsers,
  createUserByAdmin,
  updateUser,
  deleteUser,
  getAdminPageData
};