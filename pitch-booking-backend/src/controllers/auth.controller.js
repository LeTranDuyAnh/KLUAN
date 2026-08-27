const User = require('../models/user.model');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// 1. Đăng ký tài khoản
async function register(req, reply) {
  try {
    const { name, email, password, phone, role } = req.body;

    // Kiểm tra xem email đã tồn tại chưa
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return reply.code(400).send({ error: 'Email này đã được đăng ký bởi tài khoản khác!' });
    }

    // Mã hóa mật khẩu
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Tạo user mới (role có thể là 'customer' hoặc 'owner', mặc định là 'customer')
    const newUser = new User({
      name,
      email,
      passwordHash,
      phone,
      role: role || 'customer'
    });

    await newUser.save();

    const userResponse = newUser.toObject();
    delete userResponse.passwordHash;

    return reply.code(201).send({
      message: 'Đăng ký tài khoản thành công!',
      data: userResponse
    });
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Lỗi server nội bộ khi đăng ký!' });
  }
}

// 2. Đăng nhập hệ thống
async function login(req, reply) {
  try {
    const { email, password } = req.body;

    // Tìm kiếm user theo email
    const user = await User.findOne({ email });
    if (!user) {
      return reply.code(400).send({ error: 'Email hoặc mật khẩu không chính xác!' });
    }

    // So sánh mật khẩu
    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return reply.code(400).send({ error: 'Email hoặc mật khẩu không chính xác!' });
    }

    // Tạo JWT Token (thời hạn 1 ngày)
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1d' }
    );

    return reply.code(200).send({
      message: 'Đăng nhập thành công!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error(error);
    return reply.code(500).send({ error: 'Lỗi server nội bộ khi đăng nhập!' });
  }
}

module.exports = { register, login };