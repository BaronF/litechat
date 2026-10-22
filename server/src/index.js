const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const { register, login } = require('./auth');
const { initSchema } = require('./database');
const routes = require('./routes');
const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// 上传文件静态服务
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 生产环境：托管前端构建产物
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  // SPA fallback（所有非 API 路由返回 index.html）
  app.get(/^(?!\/api|\/uploads|\/socket\.io).*/, (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 认证路由
app.post('/api/auth/register', register);
app.post('/api/auth/login', login);

// 业务路由
app.use('/api', routes);

// 错误处理
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: '文件太大' });
  }
  console.error(err);
  res.status(500).json({ error: err.message || '服务器错误' });
});

// Socket.IO
app.set('io', setupSocket(server));

const PORT = process.env.PORT || 3001;

// 初始化数据库后启动
initSchema()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`聊天服务器运行在端口 ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('数据库初始化失败:', err);
    process.exit(1);
  });
