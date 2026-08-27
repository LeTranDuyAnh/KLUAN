const { register, login } = require('../controllers/auth.controller');

async function authRoutes(fastify, options) {
  fastify.post('/api/auth/register', register);
  fastify.post('/api/auth/login', login);

  fastify.get('/auth', async (req, reply) => {
  return reply.view('auth.pug');
});
}

module.exports = authRoutes;