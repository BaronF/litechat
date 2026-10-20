const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const { verifyToken } = require('./auth');
const { query } = require('./database');
const { getLinkPreview } = require('./linkPreview');

const onlineUsers = new Map();

function setupSocket(server) {
  const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 50 * 1024 * 1024,
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000,
      skipMiddlewares: false
    }
  });

  // JWT 认证中间件
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('未授权'));
    try {
      const decoded = verifyToken(token);
      const result = await query(
        'SELECT id, username, nickname, avatar FROM users WHERE id = $1',
        [decoded.userId]
      );
      if (!result.rows[0]) return next(new Error('用户不存在'));
      socket.user = result.rows[0];
      next();
    } catch (err) {
      next(new Error('Token 无效'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`用户上线: ${socket.user.nickname}`);

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    await query('UPDATE users SET status = $1 WHERE id = $2', ['online', userId]);

    // 加入所有会话房间
    const convs = await query(
      'SELECT conversation_id FROM conversation_members WHERE user_id = $1',
      [userId]
    );
    convs.rows.forEach(c => socket.join(c.conversation_id));

    socket.broadcast.emit('user_status', { userId, status: 'online' });

    // ---- 发送消息 ----
    socket.on('send_message', async (data, callback) => {
      try {
        const { conversationId, type, content, fileUrl, fileSize, duration } = data;

        const isMember = await query(
          'SELECT 1 FROM conversation_members WHERE conversation_id = $1 AND user_id = $2',
          [conversationId, userId]
        );
        if (!isMember.rows[0]) return callback?.({ error: '无权限' });

        const id = uuidv4();
        const now = Date.now();

        await query(`
          INSERT INTO messages (id, conversation_id, sender_id, type, content, file_url, file_size, duration, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [id, conversationId, userId, type, content, fileUrl || null, fileSize || null, duration || null, now]);

        const message = {
          id,
          conversation_id: conversationId,
          sender_id: userId,
          sender_nickname: socket.user.nickname,
          sender_avatar: socket.user.avatar,
          type,
          content,
          file_url: fileUrl || null,
          file_size: fileSize || null,
          duration: duration || null,
          link_title: null,
          link_description: null,
          link_image: null,
          created_at: now
        };

        // 立即广播
        io.to(conversationId).emit('new_message', message);
        callback?.({ ok: true, message });

        // 链接预览异步补充
        if (type === 'link') {
          getLinkPreview(content).then(async (preview) => {
            if (!preview) return;
            await query(`
              UPDATE messages SET link_title = $1, link_description = $2, link_image = $3 WHERE id = $4
            `, [preview.title || null, preview.description || null, preview.image || null, id]);
            io.to(conversationId).emit('message_update', {
              id,
              conversation_id: conversationId,
              link_title: preview.title || null,
              link_description: preview.description || null,
              link_image: preview.image || null,
            });
          }).catch(() => {});
        }
      } catch (err) {
        console.error('发送消息错误:', err);
        callback?.({ error: '发送失败' });
      }
    });

    // ---- 正在输入 ----
    socket.on('typing', ({ conversationId, isTyping }) => {
      socket.to(conversationId).emit('typing', {
        userId,
        nickname: socket.user.nickname,
        conversationId,
        isTyping
      });
    });

    // ---- 标记已读 ----
    socket.on('mark_read', async ({ conversationId }) => {
      const unread = await query(`
        SELECT id FROM messages
        WHERE conversation_id = $1 AND sender_id != $2
        AND id NOT IN (SELECT message_id FROM message_reads WHERE user_id = $2)
      `, [conversationId, userId]);

      const now = Date.now();
      for (const msg of unread.rows) {
        await query(
          'INSERT INTO message_reads (message_id, user_id, read_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
          [msg.id, userId, now]
        );
      }
      if (unread.rows.length > 0) {
        socket.to(conversationId).emit('messages_read', { conversationId, userId });
      }
    });

    // ---- 断开连接 ----
    socket.on('disconnect', async () => {
      const sockets = onlineUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          onlineUsers.delete(userId);
          await query('UPDATE users SET status = $1 WHERE id = $2', ['offline', userId]);
          io.emit('user_status', { userId, status: 'offline' });
          console.log(`用户下线: ${socket.user.nickname}`);
        }
      }
    });
  });

  return io;
}

module.exports = { setupSocket };
