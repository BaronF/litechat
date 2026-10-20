import React, { useState, useRef, useCallback } from 'react';
import {
  Send, Image, Video, Mic
} from 'lucide-react';
import { getSocket } from '../hooks/useSocket';
import { useChatStore } from '../store/chatStore';
import api from '../utils/api';
import { extractUrl } from '../utils/format';
import VoiceRecorder from './VoiceRecorder';
import { Message } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface Props {
  conversationId: string;
}

export default function MessageInput({ conversationId }: Props) {
  const [text, setText] = useState('');
  const [showVoice, setShowVoice] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendFeedback, setSendFeedback] = useState('');
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMessageRef = useRef<{ id: string; content: string } | null>(null);
  const { addMessage } = useChatStore();

  const emitTyping = useCallback((isTyping: boolean) => {
    const socket = getSocket();
    if (socket) socket.emit('typing', { conversationId, isTyping });
  }, [conversationId]);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);
    if (pendingMessageRef.current?.content !== value.trim()) pendingMessageRef.current = null;
    setSendFeedback('');
    emitTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => emitTyping(false), 2000);
  };

  const sendTextMessage = () => {
    const trimmed = text.trim();
    if (!trimmed || isSending) return;

    const url = extractUrl(trimmed);
    const type = url && trimmed === url ? 'link' : 'text';
    const content = type === 'link' ? url! : trimmed;

    const socket = getSocket();
    if (!socket) {
      setSendFeedback('聊天连接尚未准备好，消息仍保留在输入框中，请稍后重试。');
      return;
    }

    const pending = pendingMessageRef.current;
    const clientMessageId = pending?.content === content ? pending.id : uuidv4();
    pendingMessageRef.current = { id: clientMessageId, content };
    setIsSending(true);
    setSendFeedback(socket.connected ? '正在发送...' : '正在连接聊天服务器...');
    emitTyping(false);

    const sendWhenConnected = () => {
      setSendFeedback('正在发送...');
      socket.timeout(15000).emit('send_message', { conversationId, type, content, clientMessageId }, (
        error: Error | null,
        response?: {
          message?: Message;
          error?: string;
        }
      ) => {
        setIsSending(false);
        if (error) {
          setSendFeedback('未收到服务器确认，消息草稿已保留；请先查看聊天记录再重试。');
          return;
        }
        if (response?.error) {
          pendingMessageRef.current = null;
          setSendFeedback(response.error);
          return;
        }
        if (!response?.message) {
          setSendFeedback('发送失败，消息草稿已保留，请重试。');
          return;
        }

        addMessage(response.message);
        pendingMessageRef.current = null;
        setText((current) => current.trim() === trimmed ? '' : current);
        setSendFeedback('');
      });
    };

    if (socket.connected) {
      sendWhenConnected();
      return;
    }

    let connectionTimer: ReturnType<typeof setTimeout>;
    const onConnect = () => {
      clearTimeout(connectionTimer);
      sendWhenConnected();
    };
    connectionTimer = setTimeout(() => {
      socket.off('connect', onConnect);
      setIsSending(false);
      setSendFeedback('连接超时，消息已保留；连接恢复后请重新发送。');
    }, 15000);
    socket.once('connect', onConnect);
    socket.connect();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTextMessage();
    }
  };

  const uploadAndSend = async (file: File, type: 'image' | 'video') => {
    setUploadProgress(0);
    setIsSending(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const endpoint = type === 'image' ? '/upload/image' : '/upload/video';
      const res = await api.post(endpoint, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        }
      });

      const socket = getSocket();
      if (socket) {
        socket.emit('send_message', {
          conversationId,
          type,
          content: res.data.url,
          fileUrl: res.data.url,
          fileSize: res.data.size
        });
      }
    } catch (err) {
      alert('上传失败，请重试');
    } finally {
      setIsSending(false);
      setUploadProgress(null);
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAndSend(file, 'image');
    e.target.value = '';
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAndSend(file, 'video');
    e.target.value = '';
  };

  const handleVoiceSend = async (blob: Blob, duration: number) => {
    setShowVoice(false);
    setIsSending(true);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'voice.webm');
      const res = await api.post('/upload/voice', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const socket = getSocket();
      if (socket) {
        socket.emit('send_message', {
          conversationId,
          type: 'voice',
          content: res.data.url,
          fileUrl: res.data.url,
          fileSize: res.data.size,
          duration
        });
      }
    } catch {
      alert('语音发送失败');
    } finally {
      setIsSending(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          uploadAndSend(file, 'image');
          return;
        }
      }
    }
  };

  if (showVoice) {
    return <VoiceRecorder onSend={handleVoiceSend} onCancel={() => setShowVoice(false)} />;
  }

  return (
    <div className="border-t border-gray-100 bg-white flex-shrink-0"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Upload progress */}
      {uploadProgress !== null && (
        <div className="px-4 pt-2">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span>{uploadProgress}%</span>
          </div>
        </div>
      )}

      {sendFeedback && (
        <div role="status" aria-live="polite" className={`px-4 pt-2 text-xs ${isSending ? 'text-gray-500' : 'text-red-600'}`}>
          {sendFeedback}
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-3">
        {/* Tools */}
        <div className="flex gap-1 pb-1">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageSelect} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoSelect} />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isSending}
            title="发送图片"
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40"
          >
            <Image className="w-5 h-5" />
          </button>
          <button
            onClick={() => videoInputRef.current?.click()}
            disabled={isSending}
            title="发送视频"
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40"
          >
            <Video className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowVoice(true)}
            disabled={isSending}
            title="发送语音"
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-green-500 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-40"
          >
            <Mic className="w-5 h-5" />
          </button>
        </div>

        {/* Text input */}
        <textarea
          value={text}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={isSending}
          placeholder="输入消息，粘贴链接可预览...（Enter 发送，Shift+Enter 换行）"
          rows={1}
          className="flex-1 resize-none bg-gray-100 rounded-2xl px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-100 max-h-28 overflow-y-auto leading-relaxed"
          style={{ minHeight: '40px' }}
          onInput={(e) => {
            const el = e.target as HTMLTextAreaElement;
            el.style.height = 'auto';
            el.style.height = Math.min(el.scrollHeight, 112) + 'px';
          }}
        />

        {/* Send button */}
        <button
          type="button"
          onClick={sendTextMessage}
          disabled={!text.trim() || isSending}
          aria-label="发送消息"
          className="w-10 h-10 bg-green-500 hover:bg-green-600 disabled:bg-gray-200 rounded-full flex items-center justify-center transition-colors shadow flex-shrink-0"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
