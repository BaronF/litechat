import React, { useState, useCallback } from 'react';
import { X, Search, UserPlus, Users } from 'lucide-react';
import api from '../utils/api';
import { User } from '../types';
import Avatar from './Avatar';
import { useChatStore } from '../store/chatStore';

interface Props {
  onClose: () => void;
}

export default function NewChatModal({ onClose }: Props) {
  const [tab, setTab] = useState<'private' | 'group'>('private');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [selected, setSelected] = useState<User[]>([]);
  const [groupName, setGroupName] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const { addConversation, setActiveConv, loadMessages } = useChatStore();

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setIsSearching(true);
    try {
      const res = await api.get('/users/search', { params: { q } });
      setResults(res.data);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    search(v);
  };

  const toggleSelect = (user: User) => {
    setSelected(prev =>
      prev.find(u => u.id === user.id)
        ? prev.filter(u => u.id !== user.id)
        : [...prev, user]
    );
  };

  const startPrivateChat = async (user: User) => {
    const res = await api.post('/conversations/private', { targetUserId: user.id });
    addConversation(res.data);
    setActiveConv(res.data.id);
    loadMessages(res.data.id);
    onClose();
  };

  const createGroup = async () => {
    if (!groupName.trim()) return;
    if (selected.length === 0) return;
    const res = await api.post('/conversations/group', {
      name: groupName.trim(),
      memberIds: selected.map(u => u.id)
    });
    addConversation(res.data);
    setActiveConv(res.data.id);
    loadMessages(res.data.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">新建聊天</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-50 px-6 pt-4 gap-2">
          {(['private', 'group'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === t ? 'bg-white shadow text-green-600' : 'text-gray-500 hover:bg-white'
              }`}
            >
              {t === 'private' ? <><UserPlus className="w-4 h-4" />私聊</> : <><Users className="w-4 h-4" />群聊</>}
            </button>
          ))}
        </div>

        <div className="px-6 py-4">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索用户名或昵称"
              value={query}
              onChange={handleQueryChange}
              className="w-full pl-9 pr-4 py-2.5 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-100"
              autoFocus
            />
          </div>

          {/* Group name input */}
          {tab === 'group' && (
            <input
              type="text"
              placeholder="群聊名称"
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 mb-4"
            />
          )}

          {/* Selected (group) */}
          {tab === 'group' && selected.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {selected.map(u => (
                <div key={u.id} className="flex items-center gap-1 bg-green-50 border border-green-200 text-green-700 text-xs px-2 py-1 rounded-full">
                  {u.nickname}
                  <button onClick={() => toggleSelect(u)} className="text-green-400 hover:text-green-600">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Results */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {isSearching && <p className="text-sm text-gray-400 text-center py-4">搜索中...</p>}
            {!isSearching && query && results.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">未找到用户</p>
            )}
            {results.map(user => {
              const isSelected = selected.find(u => u.id === user.id);
              return (
                <div
                  key={user.id}
                  onClick={() => tab === 'private' ? startPrivateChat(user) : toggleSelect(user)}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                    isSelected ? 'bg-green-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <Avatar src={user.avatar} name={user.nickname} size="sm" />
                  <div>
                    <p className="text-sm font-medium text-gray-800">{user.nickname}</p>
                    <p className="text-xs text-gray-400">@{user.username}</p>
                  </div>
                  {tab === 'group' && (
                    <div className={`ml-auto w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'bg-green-500 border-green-500' : 'border-gray-300'
                    }`}>
                      {isSelected && <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Group create button */}
          {tab === 'group' && (
            <button
              onClick={createGroup}
              disabled={selected.length === 0 || !groupName.trim()}
              className="mt-4 w-full py-2.5 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition-colors disabled:opacity-40 text-sm"
            >
              创建群聊 {selected.length > 0 ? `(${selected.length + 1}人)` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
