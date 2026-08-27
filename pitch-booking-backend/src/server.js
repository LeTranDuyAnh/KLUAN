require('dotenv').config();
const fastify = require('fastify')({ logger: true });
const connectDB = require('./config/db');
const path = require('path');

const bookingRoutes = require('./routes/booking.route');
const adminRoutes = require('./routes/admin.route');
const homeRoutes = require('./routes/home.route');
const authRoutes = require('./routes/auth.route');
const ownerRoutes = require('./routes/owner.routes');

// 1. Đăng ký các plugin cốt lõi (Multipart & Static) TRƯỚC TIÊN
fastify.register(require('@fastify/multipart'), {
  limits: {
    fileSize: 5 * 1024 * 1024 // Giới hạn mỗi file tối đa 5MB
  }
});

fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'), // Trỏ vào thư mục src/public
  prefix: '/',                         // Để prefix là '/' để giữ nguyên đường dẫn /uploads/...
  decorateReply: false
});

// Đăng ký @fastify/view
fastify.register(require('@fastify/view'), {
  engine: {
    pug: require('pug')
  },
  root: path.join(__dirname, 'views'), // Thư mục chứa file pug
});

// Đăng ký cors nếu cần gọi từ Frontend
fastify.register(require('@fastify/cors'), { origin: '*' });

// 2. Sau đó mới đăng ký các routes
fastify.register(bookingRoutes);
fastify.register(adminRoutes);
fastify.register(homeRoutes);
fastify.register(authRoutes);
fastify.get('/owner', async (request, reply) => {
  return reply.view('owner.pug');
});
fastify.register(ownerRoutes);
fastify.register(require('./routes/customer.route'));

// Khởi chạy server
const start = async () => {
  try {
    await connectDB();
    const port = process.env.PORT || 5000;
    await fastify.listen({ port });
    console.log(`🚀 Fastify server is running at http://localhost:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();