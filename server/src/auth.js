const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./database');

const JWT_SECRET = process.env.JWT_SECRET || 'chat-app-secret-2024';

function generateToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未授权' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    const result = await query(
      'SELECT id, username, nickname, avatar, status FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!result.rows[0]) return res.status(401).json({ error: '用户不存在' });
    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token 无效或已过期' });
  }
}

async function register(req, res) {
  const { username, password, nickname } = req.body;
  if (!username || !password || !nickname) {
    return res.status(400).json({ error: '用户名、密码、昵称不能为空' });
  }
  if (username.length < 3 || username.length > 20) {
    return res.status(400).json({ error: '用户名长度 3-20 位' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: '密码至少 6 位' });
  }

  try {
    const existing = await query('SELECT id FROM users WHERE username = $1', [username]);
    if (existing.rows[0]) return res.status(409).json({ error: '用户名已存在' });

    const id = uuidv4();
    const passwordHash = await bcrypt.hash(password, 10);
    const now = Date.now();

    await query(
      'INSERT INTO users (id, username, nickname, password_hash, created_at) VALUES ($1, $2, $3, $4, $5)',
      [id, username, nickname, passwordHash, now]
    );

    const token = generateToken(id);
    res.json({ token, user: { id, username, nickname, avatar: null } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '注册失败' });
  }
}

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }

  try {
    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user.id);
    res.json({
      token,
      user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '登录失败' });
  }
}

module.exports = { authMiddleware, register, login, verifyToken };
