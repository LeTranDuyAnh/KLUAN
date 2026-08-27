const { verifyRole } = require('../middleware/auth.middleware');
const { 
  getUsers, 
  createUserByAdmin, 
  updateUser, 
  deleteUser,
  getAdminPageData // Import thêm hàm lấy dữ liệu
} = require('../controllers/admin.controller');

async function adminRoutes(fastify, options) {
  // --- API BẢO MẬT (Cho các request AJAX/Fetch từ client) ---
  fastify.get('/api/admin/users', { preHandler: verifyRole('admin') }, getUsers);
  fastify.post('/api/admin/users', { preHandler: verifyRole('admin') }, createUserByAdmin);
  fastify.put('/api/admin/users/:id', { preHandler: verifyRole('admin') }, updateUser);
  fastify.delete('/api/admin/users/:id', { preHandler: verifyRole('admin') }, deleteUser);

  // --- GIAO DIỆN ADMIN (SSR - Server Side Rendering lấy trực tiếp từ DB) ---
  fastify.get('/admin', async (req, reply) => {
    try {
      // Lấy dữ liệu trực tiếp từ DB trước khi render
      const usersList = await getAdminPageData();
      
      // Truyền dữ liệu sang file admin.pug
      return reply.view('admin.pug', { users: usersList });
    } catch (error) {
      console.error(error);
      return reply.view('admin.pug', { users: [] });
    }
  });
}

module.exports = adminRoutes;