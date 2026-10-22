import React, { useEffect, useState } from 'react';
import { LogOut, Search, UserPlus, Users, X } from 'lucide-react';
import api from '../utils/api';
import { Conversation, User } from '../types';
import { useAuthStore } from '../store/authStore';
import { useChatStore } from '../store/chatStore';
import { getSocket } from '../hooks/useSocket';
import Avatar from './Avatar';

interface Props {
  conversation: Conversation;
  onClose: () => void;
}

export default function GroupInfoPanel({ conversation, onClose }: Props) {
  const { user } = useAuthStore();
  const { setActiveConv, loadConversations } = useChatStore();
  const [members, setMembers] = useState<User[]>([]);
  const [results, setResults] = useState<User[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const isOwner = conversation.created_by === user?.id;

  const loadMembers = async () => {
    const res = await api.get(`/conversations/${conversation.id}/members`);
    setMembers(res.data);
  };

  useEffect(() => {
    let cancelled = false;
    api.get(`/conversations/${conversation.id}/members`).then((res) => {
      if (!cancelled) setMembers(res.data);
    }).catch(() => {
      if (!cancelled) setError('无法加载群成员');
    });
    return () => { cancelled = true; };
  }, [conversation.id]);

  useEffect(() => {
    const socket = getSocket();
    const refreshMembers = (event: { conversationId: string }) => {
      if (event.conversationId === conversation.id) void loadMembers();
    };
    socket?.on('conversation_members_changed', refreshMembers);
    return () => { socket?.off('conversation_members_changed', refreshMembers); };
  }, [conversation.id]);

  const searchUsers = async (value: string) => {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    try {
      const res = await api.get('/users/search', { params: { q: value } });
      setResults(res.data);
    } catch {
      setError('搜索用户失败');
    }
  };

  const addSelectedMembers = async () => {
    if (!selectedIds.length) return;
    setIsSaving(true);
    setError('');
    try {
      await api.post(`/conversations/${conversation.id}/members`, { memberIds: selectedIds });
      setSelectedIds([]);
      setQuery('');
      setResults([]);
      await loadMembers();
    } catch (err: any) {
      setError(err.response?.data?.error || '添加成员失败');
    } finally {
      setIsSaving(false);
    }
  };

  const removeMember = async (member: User) => {
    if (!window.confirm(`确定将 ${member.nickname} 移出群聊吗？`)) return;
    setError('');
    try {
      await api.delete(`/conversations/${conversation.id}/members/${member.id}`);
      setMembers((current) => current.filter((item) => item.id !== member.id));
    } catch (err: any) {
      setError(err.response?.data?.error || '移除成员失败');
    }
  };

  const leaveGroup = async () => {
    if (!window.confirm('确定退出这个群聊吗？')) return;
    setIsSaving(true);
    setError('');
    try {
      await api.delete(`/conversations/${conversation.id}/members/me`);
      setActiveConv('');
      await loadConversations();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || '退群失败');
    } finally {
      setIsSaving(false);
    }
  };

  const visibleResults = results.filter((item) => !members.some((member) => member.id === item.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}>
      <section className="w-full max-w-md max-h-[85vh] overflow-hidden rounded-xl bg-white shadow-xl" aria-label="群成员管理">
        <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-green-500" />
            <div>
              <h2 className="font-semibold text-gray-800">{conversation.name || '群聊'}</h2>
              <p className="text-xs text-gray-400">{members.length} 位成员</p>
            </div>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100" aria-label="关闭">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[calc(85vh-72px)] overflow-y-auto px-5 py-4">
          {isOwner && (
            <div className="mb-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">添加成员</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={query}
                  onChange={(e) => void searchUsers(e.target.value)}
                  placeholder="搜索用户名或昵称"
                  className="w-full rounded-lg bg-gray-100 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-green-100"
                />
              </div>
              {visibleResults.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-100">
                  {visibleResults.map((item) => {
                    const selected = selectedIds.includes(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedIds((current) => selected
                          ? current.filter((id) => id !== item.id)
                          : [...current, item.id]
                        )}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left ${selected ? 'bg-green-50' : 'hover:bg-gray-50'}`}
                      >
                        <Avatar src={item.avatar} name={item.nickname} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-800">{item.nickname} <span className="text-gray-400">@{item.username}</span></span>
                        <span className={`h-4 w-4 rounded border ${selected ? 'border-green-500 bg-green-500' : 'border-gray-300'}`} />
                      </button>
                    );
                  })}
                </div>
              )}
              {selectedIds.length > 0 && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void addSelectedMembers()}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-green-500 px-3 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-50"
                >
                  <UserPlus className="h-4 w-4" />
                  添加 {selectedIds.length} 位成员
                </button>
              )}
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-medium text-gray-700">群成员</h3>
            <div className="divide-y divide-gray-100">
              {members.map((member) => (
                <div key={member.id} className="flex items-center gap-3 py-2.5">
                  <Avatar src={member.avatar} name={member.nickname} size="sm" online={member.status === 'online'} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-gray-800">{member.nickname}</p>
                    <p className="truncate text-xs text-gray-400">@{member.username}</p>
                  </div>
                  {member.id === conversation.created_by && (
                    <span className="rounded bg-green-50 px-2 py-1 text-xs text-green-700">群主</span>
                  )}
                  {isOwner && member.id !== user?.id && (
                    <button onClick={() => void removeMember(member)} className="text-xs text-red-500 hover:text-red-700">移除</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}

          <button
            type="button"
            disabled={isSaving}
            onClick={() => void leaveGroup()}
            className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            退出群聊
          </button>
        </div>
      </section>
    </div>
  );
}
