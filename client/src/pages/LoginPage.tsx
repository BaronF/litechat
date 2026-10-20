import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { MessageCircle } from 'lucide-react';

export default function LoginPage() {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [form, setForm] = useState({ username: '', password: '', nickname: '' });
  const [error, setError] = useState('');
  const { login, register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      if (tab === 'login') {
        await login(form.username, form.password);
      } else {
        await register(form.username, form.password, form.nickname);
      }
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.error || '操作失败，请重试');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-green-500 rounded-2xl flex items-center justify-center mb-3 shadow-lg">
            <MessageCircle className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-800">轻聊</h1>
          <p className="text-gray-400 text-sm mt-1">简洁高效的聊天体验</p>
        </div>

        {/* Tabs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t ? 'bg-white shadow text-green-600' : 'text-gray-500'
              }`}
            >
              {t === 'login' ? '登录' : '注册'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            placeholder="用户名"
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 transition"
            autoComplete="username"
          />

          {tab === 'register' && (
            <input
              type="text"
              placeholder="昵称（显示给其他用户）"
              value={form.nickname}
              onChange={e => setForm({ ...form, nickname: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 transition"
            />
          )}

          <input
            type="password"
            placeholder="密码"
            value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })}
            className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 transition"
            autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-xl transition-colors disabled:opacity-50 shadow"
          >
            {isLoading ? '处理中...' : (tab === 'login' ? '登录' : '创建账号')}
          </button>
        </form>
      </div>
    </div>
  );
}
