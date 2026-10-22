const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { query } = require('./database');
const { authMiddleware } = require('./auth');
const { imageUpload, videoUpload, voiceUpload, avatarUpload } = require('./upload');
const { getLinkPreview } = require('./linkPreview');

const router = express.Router();

function notifyConversationMembership(req, userIds, conversationId, event) {
  const io = req.app.get('io');
  if (!io) return;
  for (const userId of userIds) {
    const room = `user:${userId}`;
    if (event === 'added') io.in(room).socketsJoin(conversationId);
    if (event === 'removed') io.in(room).socketsLeave(conversationId);
    io.to(room).emit('conversation_membership_changed', { conversationId, event });
  }
}

function notifyCurrentConversationMembers(req, conversationId) {
  const io = req.app.get('io');
  if (io) io.to(conversationId).emit('conversation_members_changed', { conversationId });
}

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
       AND NOT EXISTS (
         SELECT 1 FROM message_reads mr WHERE mr.message_id = msg.id AND mr.user_id = $1
       )) as unread_count,
      (SELECT COUNT(*) FROM messages msg
       WHERE msg.conversation_id = c.id
       AND msg.sender_id != $1
       AND msg.mention_user_ids @> jsonb_build_array($1::text)
       AND NOT EXISTS (
         SELECT 1 FROM message_reads mr WHERE mr.message_id = msg.id AND mr.user_id = $1
       )) as mention_unread_count
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    LEFT JOIN LATERAL (
      SELECT * FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
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

  res.json(result.map((conv) => ({
    ...conv,
    created_at: Number(conv.created_at),
    last_message_at: conv.last_message_at == null ? null : Number(conv.last_message_at),
    unread_count: Number(conv.unread_count || 0),
    mention_unread_count: Number(conv.mention_unread_count || 0)
  })));
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

  notifyConversationMembership(req, allMembers, id, 'added');

  res.json({ id, type: 'group', name, created_by: req.user.id, created_at: now });
});

router.get('/conversations/:id/members', authMiddleware, async (req, res) => {
  const isMember = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!isMember.rows[0]) return res.status(403).json({ error: '无权限' });

  const result = await query(`
    SELECT u.id, u.username, u.nickname, u.avatar, u.status, cm.joined_at
    FROM conversation_members cm
    JOIN users u ON cm.user_id = u.id
    WHERE cm.conversation_id = $1
  `, [req.params.id]);
  res.json(result.rows);
});

router.post('/conversations/:id/members', authMiddleware, async (req, res) => {
  const { memberIds } = req.body;
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: '至少选择一名成员' });
  }

  const conversationResult = await query(
    'SELECT type, created_by FROM conversations WHERE id = $1',
    [req.params.id]
  );
  const conversation = conversationResult.rows[0];
  if (!conversation || conversation.type !== 'group') return res.status(404).json({ error: '群聊不存在' });
  if (conversation.created_by !== req.user.id) return res.status(403).json({ error: '仅群主可以邀请成员' });

  const uniqueIds = [...new Set(memberIds.filter((id) => typeof id === 'string' && id !== req.user.id))];
  if (!uniqueIds.length) return res.status(400).json({ error: '请选择其他成员' });

  const users = await query('SELECT id FROM users WHERE id = ANY($1::text[])', [uniqueIds]);
  if (users.rows.length !== uniqueIds.length) return res.status(400).json({ error: '部分用户不存在' });

  const currentMembers = await query(
    'SELECT user_id FROM conversation_members WHERE conversation_id = $1 AND user_id = ANY($2::text[])',
    [req.params.id, uniqueIds]
  );
  const existingIds = new Set(currentMembers.rows.map((row) => row.user_id));
  const addedIds = uniqueIds.filter((id) => !existingIds.has(id));
  const now = Date.now();
  for (const userId of addedIds) {
    await query(
      'INSERT INTO conversation_members (conversation_id, user_id, joined_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [req.params.id, userId, now]
    );
  }

  notifyConversationMembership(req, addedIds, req.params.id, 'added');
  notifyCurrentConversationMembers(req, req.params.id);
  res.json({ added: addedIds.length });
});

router.delete('/conversations/:id/members/me', authMiddleware, async (req, res) => {
  const conversationResult = await query(
    'SELECT type, created_by FROM conversations WHERE id = $1',
    [req.params.id]
  );
  const conversation = conversationResult.rows[0];
  if (!conversation || conversation.type !== 'group') return res.status(404).json({ error: '群聊不存在' });

  const result = await query(
    'DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 RETURNING user_id',
    [req.params.id, req.user.id]
  );
  if (!result.rows[0]) return res.status(404).json({ error: '你已不在该群聊中' });

  if (conversation.created_by === req.user.id) {
    const successor = await query(
      'SELECT user_id FROM conversation_members WHERE conversation_id = $1 ORDER BY joined_at ASC, user_id ASC LIMIT 1',
      [req.params.id]
    );
    await query('UPDATE conversations SET created_by = $1 WHERE id = $2', [successor.rows[0]?.user_id || null, req.params.id]);
  }

  notifyConversationMembership(req, [req.user.id], req.params.id, 'removed');
  notifyCurrentConversationMembers(req, req.params.id);
  res.json({ ok: true });
});

router.delete('/conversations/:id/members/:userId', authMiddleware, async (req, res) => {
  if (req.params.userId === req.user.id) return res.status(400).json({ error: '请使用退群操作' });

  const conversationResult = await query(
    'SELECT type, created_by FROM conversations WHERE id = $1',
    [req.params.id]
  );
  const conversation = conversationResult.rows[0];
  if (!conversation || conversation.type !== 'group') return res.status(404).json({ error: '群聊不存在' });
  if (conversation.created_by !== req.user.id) return res.status(403).json({ error: '仅群主可以移除成员' });

  const result = await query(
    'DELETE FROM conversation_members WHERE conversation_id = $1 AND user_id = $2 RETURNING user_id',
    [req.params.id, req.params.userId]
  );
  if (!result.rows[0]) return res.status(404).json({ error: '群成员不存在' });

  notifyConversationMembership(req, [req.params.userId], req.params.id, 'removed');
  notifyCurrentConversationMembers(req, req.params.id);
  res.json({ ok: true });
});

// ============ 消息相关 ============

router.get('/conversations/:id/messages', authMiddleware, async (req, res) => {
  const isMember = await query(
    'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!isMember.rows[0]) return res.status(403).json({ error: '无权限' });

  const { before, limit = 50, initial } = req.query;
  const pageSize = Math.min(parseInt(limit), 100);

  let result;
  let firstUnreadMessageId = null;
  if (before) {
    result = await query(`
      SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1 AND m.created_at < $2
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $3
    `, [req.params.id, parseInt(before), pageSize]);
  } else if (initial === '1') {
    const unread = await query(`
      SELECT m.id, m.created_at
      FROM messages m
      WHERE m.conversation_id = $1 AND m.sender_id != $2
      AND NOT EXISTS (
        SELECT 1 FROM message_reads mr WHERE mr.message_id = m.id AND mr.user_id = $2
      )
      ORDER BY m.created_at ASC, m.id ASC
      LIMIT 1
    `, [req.params.id, req.user.id]);

    if (unread.rows[0]) {
      firstUnreadMessageId = unread.rows[0].id;
      result = await query(`
        SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = $1 AND (m.created_at, m.id) >= ($2, $3)
        ORDER BY m.created_at ASC, m.id ASC
        LIMIT $4
      `, [req.params.id, unread.rows[0].created_at, unread.rows[0].id, pageSize]);
    } else {
      result = await query(`
        SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.conversation_id = $1
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT $2
      `, [req.params.id, pageSize]);
    }
  } else {
    result = await query(`
      SELECT m.*, u.nickname as sender_nickname, u.avatar as sender_avatar
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = $1
      ORDER BY m.created_at DESC, m.id DESC
      LIMIT $2
    `, [req.params.id, pageSize]);
  }

  const messages = (initial === '1' && firstUnreadMessageId ? result.rows : result.rows.reverse()).map((message) => ({
    ...message,
    created_at: Number(message.created_at)
  }));
  if (initial === '1') return res.json({ messages, firstUnreadMessageId });
  res.json(messages);
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
