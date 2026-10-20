const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./database');
const { authMiddleware } = require('./auth');
const { imageUpload, videoUpload, voiceUpload, avatarUpload } = require('./upload');
const { getLinkPreview } = require('./linkPreview');

const router = express.Router();

// ============ 用户相关 ============

router.get('/users/search', authMiddleware, async (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  const result = await query(
    `SELECT id, username, nickname, avatar FROM users
     WHERE (username ILIKE $1 OR nickname ILIKE $1) AND id != $2
     LIMIT 20`,
    [`%${q}%`, req.user.id]
  );
  res.json(result.rows);
});

router.get('/users/me', authMiddleware, (req, res) => {
  res.json(req.user);
});

router.post('/users/avatar', authMiddleware, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  const avatarUrl = `/uploads/images/${req.file.filename}`;
  await query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarUrl, req.user.id]);
  res.json({ avatar: avatarUrl });
});

router.put('/users/nickname', authMiddleware, async (req, res) => {
  const { nickname } = req.body;
  if (!nickname || nickname.trim().length === 0) {
    return res.status(400).json({ error: '昵称不能为空' });
  }
  await query('UPDATE users SET nickname = $1 WHERE id = $2', [nickname.trim(), req.user.id]);
  res.json({ nickname: nickname.trim() });
});

// ============ 会话相关 ============

router.get('/conversations', authMiddleware, async (req, res) => {
  const { rows } = await query(`
    SELECT c.*,
      m.content as last_message,
      m.type as last_message_type,
      m.created_at as last_message_at,
      u.nickname as last_sender_nickname,
      (SELECT COUNT(*) FROM messages msg
       WHERE msg.conversation_id = c.id
       AND msg.sender_id != $1
       AND msg.id NOT IN (
         SELECT message_id FROM message_reads WHERE user_id = $1
       )) as unread_count
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    LEFT JOIN LATERAL (
      SELECT * FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
    ) m ON true
    LEFT JOIN users u ON m.sender_id = u.id
    WHERE cm.user_id = $1
    ORDER BY COALESCE(m.created_at, c.created_at) DESC
  `, [req.user.id]);

  const result = await Promise.all(rows.map(async (conv) => {
    if (conv.type === 'private') {
      const other = await query(`
        SELECT u.id, u.nickname, u.avatar, u.status
        FROM conversation_members cm
        JOIN users u ON cm.user_id = u.id
        WHERE cm.conversation_id = $1 AND cm.user_id != $2
      `, [conv.id, req.user.id]);
      return { ...conv, otherUser: other.rows[0] || null };
    }
    return conv;
  }));

  res.json(result);
});

router.post('/conversations/private', authMiddleware, async (req, res) => {
  const { targetUserId } = req.body;
  if (!targetUserId) return res.status(400).json({ error: 'targetUserId 不能为空' });

  const targetResult = await query('SELECT id, nickname, avatar FROM users WHERE id = $1', [targetUserId]);
  const target = targetResult.rows[0];
  if (!target) return res.status(404).json({ error: '用户不存在' });

  const existing = await query(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = $1
    JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = $2
    WHERE c.type = 'private'
    LIMIT 1
  `, [req.user.id, targetUserId]);

  if (existing.rows[0]) {
    const conv = await query('SELECT * FROM conversations WHERE id = $1', [existing.rows[0].id]);
    return res.json({ ...conv.rows[0], otherUser: target });
  }

  const id = uuidv4();
  const now = Date.now();
  await query('INSERT INTO conversations (id, type, created_by, created_at) VALUES ($1, $2, $3, $4)', [id, 'private', req.user.id, now]);
  await query('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3)', [id, req.user.id, now]);
  await query('INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3)', [id, targetUserId, now]);

  res.json({ id, type: 'private', created_at: now, otherUser: target });
});

router.post('/conversations/group', authMiddleware, async (req, res) => {
  const { name, memberIds } = req.body;
  if (!name) return res.status(400).json({ error: '群名不能为空' });
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: '至少选择一名成员' });
  }

  const id = uuidv4();
  const now = Date.now();
  await query('INSERT INTO conversations (id, type, name, created_by, created_at) VALUES ($1, $2, $3, $4, $5)', [id, 'group', name, req.user.id, now]);

  const allMembers = [...new Set([req.user.id, ...memberIds])];
  for (const uid of allMembers) {
    await query(
      'INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [id, uid, now]
    );
  }

  res.json({ id, type: 'group', name, created_at: now });
});

router.get('/conversations/:id/members', authMiddleware, async (req, res) => {
  const isMember = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!isMember.rows[0]) return res.status(403).json({ error: '无权限' });

  const result = await query(`
    SELECT u.id, u.nickname, u.avatar, u.status
    FROM conversation_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.conversation_id = $1
  `, [req.params.id]);
  res.json(result.rows);
});

// ============ 消息相关 ============

router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const isMember = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!isMember.rows[0]) return res.status(403).json({ error: '无权限' });

  const { before, limit = 50 } = req.query;
  const pageSize = Math.min(parseInt(limit), 100);

  let result;
  if (before) {
    result = await query(`
      SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1 AND m.created_at < $2
      ORDER BY m.created_at DESC
      LIMIT $3
    `, [req.params.id, parseInt(before), pageSize]);
  } else {
    result = await query(`
      SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC
      LIMIT $2
    `, [req.params.id, pageSize]);
  }

  res.json(result.rows.reverse());
});

router.post('/conversations/:id/read', authMiddleware, async (req, res) => {
  const unread = await query(`
    SELECT id FROM messages
    WHERE conversation_id = $1 AND sender_id != $2
    AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $2)
  `, [req.params.id, req.user.id]);

  const now = Date.now();
  for (const msg of unread.rows) {
    await query(
      'INSERT INTO message_reads (message_id, user_id, read_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [msg.id, req.user.id, now]
    );
  }
  res.json({ ok: true });
});

// ============ 媒体上传 ============

router.post('/upload/image', authMiddleware, imageUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  res.json({ url: `/uploads/images/${req.file.filename}`, size: req.file.size });
});

router.post('/upload/video', authMiddleware, videoUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  res.json({ url: `/uploads/videos/${req.file.filename}`, size: req.file.size });
});

router.post('/upload/voice', authMiddleware, voiceUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' });
  res.json({ url: `/uploads/voices/${req.file.filename}`, size: req.file.size });
});

router.post('/link-preview', authMiddleware, async (req, res) => {
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'url 不能为空' });
  const preview = await getLinkPreview(url);
  res.json(preview || {});
});

module.exports = router;
