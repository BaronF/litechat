import React, { useState } from 'react';
import { Search, Plus, Users, MessageCircle } from 'lucide-react';
import { useChatStore } from '../store/chatStore';
import { useAuthStore } from '../store/authStore';
import Avatar from './Avatar';
import { formatTime } from '../utils/format';
import { Conversation } from '../types';
import NewChatModal from './NewChatModal';

function lastMessagePreview(conv: Conversation): string {
  if (!conv.last_message) return '暂无消息';
  const prefix = conv.type === 'group' && conv.last_sender_nickname
    ? `${conv.last_sender_nickname}: `
    : '';
  switch (conv.last_message_type) {
    case 'image': return prefix + '[图片]';
    case 'video': return prefix + '[视频]';
    case 'voice': return prefix + '[语音]';
    case 'link': return prefix + '[链接]';
    default: return prefix + conv.last_message;
  }
}

export default function ConversationList() {
  const { conversations, activeConvId, setActiveConv, loadMessages, resetUnread } = useChatStore();
  const { user } = useAuthStore();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);

  const filtered = conversations.filter(c => {
    const name = c.type === 'private' ? c.otherUser?.nickname : c.name;
    return name?.toLowerCase().includes(search.toLowerCase());
  });

  const handleSelect = (conv: Conversation) => {
    loadMessages(conv.id, undefined, true);
    setActiveConv(conv.id);
    resetUnread(conv.id);
  };

  const totalUnread = conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

  return (
    <div className="flex flex-col h-full bg-white border-r border-gray-100">
      {/* Header */}
      <div className="px-4 pb-3" style={{ paddingTop: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            <span className="font-bold text-gray-800 text-lg">消息</span>
            {totalUnread > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="w-8 h-8 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shadow"
            title="新建聊天"
          >
            <Plus className="w-4 h-4 text-white" />
          </button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索会话"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-gray-400">
            <Users className="w-10 h-10 mb-2 opacity-30" />
            <p className="text-sm">还没有聊天，点击 + 开始</p>
          </div>
        )}
        {filtered.map(conv => {
          const name = conv.type === 'private'
            ? conv.otherUser?.nickname || '未知'
            : (conv.name || '群聊');
          const avatarSrc = conv.type === 'private' ? conv.otherUser?.avatar : conv.avatar;
          const isOnline = conv.type === 'private' ? conv.otherUser?.status === 'online' : undefined;
          const isActive = conv.id === activeConvId;

          return (
            <div
              key={conv.id}
              onClick={() => handleSelect(conv)}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                isActive ? 'bg-green-50' : 'hover:bg-gray-50'
              }`}
            >
              <Avatar src={avatarSrc} name={name} size="md" online={isOnline} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`font-medium truncate ${isActive ? 'text-green-700' : 'text-gray-800'}`}>
                    {name}
                  </span>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">
                    {conv.last_message_at ? formatTime(conv.last_message_at) : ''}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-sm text-gray-400 truncate">{lastMessagePreview(conv)}</p>
                  {(conv.unread_count || 0) > 0 && (
                    <span className="flex-shrink-0 ml-2 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center leading-none">
                      {conv.unread_count! > 99 ? '99+' : conv.unread_count}
                    </span>
                  )}
                  {(conv.mention_unread_count || 0) > 0 && (
                    <span className="flex-shrink-0 ml-1 bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center" title="有人提到了你">@</span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Current User */}
      <div className="border-t border-gray-100 px-4 py-3 flex items-center gap-3">
        <Avatar src={user?.avatar} name={user?.nickname || ''} size="sm" online={true} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-700 truncate">{user?.nickname}</p>
          <p className="text-xs text-gray-400 truncate">@{user?.username}</p>
        </div>
      </div>

      {showModal && <NewChatModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
