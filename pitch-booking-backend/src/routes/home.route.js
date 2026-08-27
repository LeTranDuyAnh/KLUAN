// home.route.js
const Yard = require('../models/yard.model');

async function homeRoutes(fastify, options) {
  // 1. Route render trang chủ giao diện Pug (SSR)
  fastify.get('/', async (req, reply) => {
  try {
    const yards = await Yard.find().lean().limit(8);
    // Thêm activePage: 'home' vào đây
    return reply.view('home.pug', { yards, activePage: 'home' });
  } catch (error) {
    req.log.error(error);
    return reply.view('home.pug', { yards: [], activePage: 'home' });
  }
});

  // 2. Route API trả về danh sách sân, giới hạn tối đa 5 sân cho mỗi loại
  fastify.get('/api/yards', async (req, reply) => {
    try {
      // Dùng aggregation pipeline để gom nhóm theo loại và cắt lấy tối đa 5 sân mỗi loại
      const yards = await Yard.aggregate([
        { $match: { status: 'active' } },
        { $sort: { createdAt: -1 } }, // Sắp xếp sân mới nhất lên đầu (hoặc đổi theo ý bạn)
        {
          $group: {
            _id: { $ifNull: ["$type", "$sportType"] }, // Gom nhóm theo trường phân loại sân
            yards: { $push: "$$ROOT" }
          }
        },
        {
          $project: {
            yards: { $slice: ["$yards", 5] } // Cắt giới hạn chỉ lấy 5 sân đầu tiên mỗi loại
          }
        },
        { $unwind: "$yards" },
        { $replaceRoot: { newRoot: "$yards" } } // Đưa cấu trúc trả về dạng mảng object sân phẳng như cũ
      ]);

      return reply.code(200).send({
        success: true,
        data: yards
      });
    } catch (error) {
      req.log.error(error);
      return reply.code(500).send({
        success: false,
        error: 'Không thể lấy danh sách sân từ cơ sở dữ liệu!'
      });
    }
  });
}

module.exports = homeRoutes;