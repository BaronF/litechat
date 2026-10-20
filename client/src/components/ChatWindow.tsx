import React, { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import Avatar from './Avatar';
import { getSocket } from '../hooks/useSocket';
import { Users, ChevronLeft } from 'lucide-react';
import { Message } from '../types';
import dayjs from 'dayjs';

function DateDivider({ timestamp }: { timestamp: number }) {
  const d = dayjs(timestamp);
  const today = dayjs();
  let label = '';
  if (today.diff(d, 'day') === 0) label = '今天';
  else if (today.diff(d, 'day') === 1) label = '昨天';
  else label = d.format('YYYY年MM月DD日');

  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-gray-100" />
      <span className="text-xs text-gray-400 px-2">{label}</span>
      <div className="flex-1 h-px bg-gray-100" />
    </div>
  );
}

function shouldShowDate(prev: Message | undefined, curr: Message): boolean {
  if (!prev) return true;
  return !dayjs(curr.created_at).isSame(dayjs(prev.created_at), 'day');
}

function shouldShowAvatar(messages: Message[], index: number): boolean {
  if (index === 0) return true;
  return messages[index - 1].sender_id !== messages[index].sender_id;
}

export default function ChatWindow() {
  const { conversations, activeConvId, setActiveConv, messages, typingUsers, loadMessages, resetUnread } = useChatStore();
  const { user } = useAuthStore();
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const conversation = conversations.find(c => c.id === activeConvId);
  const convMessages = activeConvId ? (messages[activeConvId] || []) : [];
  const typing = activeConvId ? (typingUsers[activeConvId] || []).filter(u => u.userId !== user?.id) : [];

  const convName = conversation
    ? (conversation.type === 'private' ? conversation.otherUser?.nickname : conversation.name) || '聊天'
    : '';
  const convAvatar = conversation?.type === 'private' ? conversation.otherUser?.avatar : conversation?.avatar;
  const isOnline = conversation?.type === 'private' ? conversation.otherUser?.status === 'online' : undefined;

  // 初次加载后滚动到底部
  useEffect(() => {
    if (activeConvId) {
      const socket = getSocket();
      if (socket) socket.emit('mark_read', { conversationId: activeConvId });
      resetUnread(activeConvId);
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 50);
    }
  }, [activeConvId]);

  // 新消息时滚到底部
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 200;
    if (isNearBottom) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [convMessages.length]);

  // iOS 键盘弹起时，将消息列表滚到最底部
  useEffect(() => {
    const onResize = () => {
      // visualViewport 在键盘弹出时高度变小
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }, 100);
    };
    window.visualViewport?.addEventListener('resize', onResize);
    return () => window.visualViewport?.removeEventListener('resize', onResize);
  }, []);

  // 上拉加载更多
  const handleScroll = async () => {
    const container = containerRef.current;
    if (!container || isLoadingMore || !activeConvId) return;
    if (container.scrollTop === 0 && convMessages.length >= 50) {
      const oldest = convMessages[0];
      if (oldest) {
        setIsLoadingMore(true);
        const prevHeight = container.scrollHeight;
        await loadMessages(activeConvId, oldest.created_at);
        setIsLoadingMore(false);
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollHeight - prevHeight;
        });
      }
    }
  };

  if (!activeConvId || !conversation) {
    return (
      <div className="flex-1 hidden md:flex flex-col items-center justify-center bg-gray-50 text-gray-400">
        <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mb-4">
          <Users className="w-10 h-10 text-gray-400" />
        </div>
        <p className="font-medium">选择一个会话开始聊天</p>
        <p className="text-sm mt-1">或者点击 + 创建新会话</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 min-w-0">
      {/* Header — 移动端加返回按钮 */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm flex-shrink-0"
        style={{ paddingTop: `calc(0.75rem + env(safe-area-inset-top, 0px))` }}
      >
        {/* 返回按钮：仅在移动端显示 */}
        <button
          onClick={() => setActiveConv('')}
          className="md:hidden -ml-1 w-9 h-9 flex items-center justify-center text-gray-500 hover:text-gray-800 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors flex-shrink-0"
          aria-label="返回"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <Avatar src={convAvatar} name={convName} size="sm" online={isOnline} />
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-gray-800 truncate text-base">{convName}</h2>
          <p className="text-xs text-gray-400">
            {isOnline !== undefined
              ? isOnline ? '在线' : '离线'
              : conversation.type === 'group' ? '群聊' : ''}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scroll-smooth-ios"
        onScroll={handleScroll}
      >
        {isLoadingMore && (
          <div className="text-center text-xs text-gray-400 py-2">加载中...</div>
        )}

        {convMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-sm">
            <p>发送第一条消息吧 👋</p>
          </div>
        )}

        {convMessages.map((msg, i) => (
          <React.Fragment key={msg.id}>
            {shouldShowDate(convMessages[i - 1], msg) && (
              <DateDivider timestamp={msg.created_at} />
            )}
            <MessageBubble
              message={msg}
              showAvatar={shouldShowAvatar(convMessages, i)}
              isGroup={conversation.type === 'group'}
            />
          </React.Fragment>
        ))}

        {/* 正在输入 */}
        {typing.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-400 px-2 py-1">
            <div className="flex gap-0.5">
              {[0, 1, 2].map(i => (
                <div
                  key={i}
                  className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
            <span>{typing.map(u => u.nickname).join('、')} 正在输入...</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* 输入框 */}
      <MessageInput conversationId={activeConvId} />
    </div>
  );
}
