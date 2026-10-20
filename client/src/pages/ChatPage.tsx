import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { useSocket } from '../hooks/useSocket';
import ConversationList from '../components/ConversationList';
import ChatWindow from '../components/ChatWindow';

export default function ChatPage() {
  const { token } = useAuthStore();
  const { loadConversations, activeConvId } = useChatStore();
  const navigate = useNavigate();

  useSocket();

  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    loadConversations();
  }, [token]);

  return (
    <div className="h-full flex bg-gray-50 overflow-hidden">
      {/*
        桌面端（md+）：左侧会话列表 + 右侧聊天窗口并排
        移动端：未选中会话时显示列表，选中后显示聊天窗口（单栏切换）
      */}

      {/* 会话列表：移动端在选中会话后隐藏 */}
      <div className={`
        flex-shrink-0 flex flex-col h-full bg-white
        w-full md:w-72
        ${activeConvId ? 'hidden md:flex' : 'flex'}
      `}>
        <ConversationList />
      </div>

      {/* 聊天窗口：移动端在未选中时隐藏 */}
      <div className={`
        flex-1 flex h-full overflow-hidden
        ${activeConvId ? 'flex' : 'hidden md:flex'}
      `}>
        <ChatWindow />
      </div>
    </div>
  );
}
