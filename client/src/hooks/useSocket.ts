import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { Message } from '../types';

let socketInstance: Socket | null = null;

export function useSocket() {
  const { token } = useAuthStore();
  const {
    addMessage,
    updateMessage,
    setTyping,
    resetUnread,
    activeConvId,
    updateUserStatus,
    loadConversations,
    loadMessages
  } = useChatStore();
  const activeConvRef = useRef(activeConvId);
  activeConvRef.current = activeConvId;

  useEffect(() => {
    if (!token) return;

    if (!socketInstance) {
      socketInstance = io('/', {
        auth: { token },
        transports: ['websocket', 'polling']
      });
    }

    const socket = socketInstance;
    const syncMessages = () => {
      void loadConversations();
      if (activeConvRef.current) void loadMessages(activeConvRef.current);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (!socket.connected) socket.connect();
      syncMessages();
    };

    socket.on('connect', syncMessages);
    document.addEventListener('visibilitychange', onVisibilityChange);

    socket.on('new_message', (msg: Message) => {
      addMessage(msg);
      if (activeConvRef.current === msg.conversation_id) {
        socket.emit('mark_read', { conversationId: msg.conversation_id });
        resetUnread(msg.conversation_id);
      }
    });

    // 链接预览异步补全
    socket.on('message_update', (patch: Partial<Message> & { id: string; conversation_id: string }) => {
      updateMessage(patch);
    });

    socket.on('typing', ({ userId, nickname, conversationId, isTyping }: {
      userId: string;
      nickname: string;
      conversationId: string;
      isTyping: boolean;
    }) => {
      setTyping(conversationId, userId, nickname, isTyping);
    });

    socket.on('user_status', ({ userId, status }: { userId: string; status: 'online' | 'offline' }) => {
      updateUserStatus(userId, status);
    });

    return () => {
      socket.off('connect', syncMessages);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      socket.off('new_message');
      socket.off('message_update');
      socket.off('typing');
      socket.off('user_status');
    };
  }, [token]);

  return socketInstance;
}

export function getSocket(): Socket | null {
  return socketInstance;
}

export function disconnectSocket() {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
}
