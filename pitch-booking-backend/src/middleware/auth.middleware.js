const jwt = require('jsonwebtoken');

// Middleware xác thực JWT token chung
async function verifyJWT(req, reply) {
  try {
    // Lấy token từ header Authorization (Bearer <token>) hoặc từ cookie/query nếu có
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Không tìm thấy Token xác thực. Vui lòng đăng nhập!' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    
    // Gắn thông tin user đã giải mã vào request để dùng ở các bước sau
    req.user = decoded;
  } catch (error) {
    return reply.code(403).send({ error: 'Token không hợp lệ hoặc đã hết hạn!' });
  }
}

// Middleware kiểm tra quyền hạn (Role-based access control)
function verifyRole(requiredRole) {
  return async (req, reply) => {
    // Chạy qua bước xác thực token trước
    await verifyJWT(req, reply);
    if (reply.sent) return; // Nếu đã phản hồi lỗi từ verifyJWT thì dừng lại

    // Kiểm tra role của user có khớp không (hoặc là admin tối cao)
    if (req.user.role !== requiredRole && req.user.role !== 'admin') {
      return reply.code(403).send({ error: 'Bạn không có quyền truy cập khu vực này!' });
    }
  };
}

module.exports = { verifyJWT, verifyRole };