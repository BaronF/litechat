import { create } from 'zustand';
import { Conversation, Message } from '../types';
import api from '../utils/api';

interface ChatState {
  conversations: Conversation[];
  activeConvId: string | null;
  messages: Record<string, Message[]>;
  typingUsers: Record<string, { userId: string; nickname: string }[]>;
  isLoadingConvs: boolean;
  isLoadingMsgs: boolean;

  loadConversations: () => Promise<void>;
  setActiveConv: (id: string) => void;
  loadMessages: (convId: string, before?: number) => Promise<Message[]>;
  addMessage: (msg: Message) => void;
  updateMessage: (patch: Partial<Message> & { id: string; conversation_id: string }) => void;
  updateConvLastMessage: (msg: Message) => void;
  decrementUnread: (convId: string) => void;
  resetUnread: (convId: string) => void;
  setTyping: (convId: string, userId: string, nickname: string, isTyping: boolean) => void;
  addConversation: (conv: Conversation) => void;
  updateUserStatus: (userId: string, status: 'online' | 'offline') => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  activeConvId: null,
  messages: {},
  typingUsers: {},
  isLoadingConvs: false,
  isLoadingMsgs: false,

  loadConversations: async () => {
    set({ isLoadingConvs: true });
    try {
      const res = await api.get('/conversations');
      set({ conversations: res.data, isLoadingConvs: false });
    } catch {
      set({ isLoadingConvs: false });
    }
  },

  setActiveConv: (id) => set({ activeConvId: id || null }),

  loadMessages: async (convId, before) => {
    set({ isLoadingMsgs: true });
    try {
      const params: Record<string, string | number> = { limit: 50 };
      if (before) params.before = before;
      const res = await api.get(`/conversations/${convId}/messages`, { params });
      const msgs: Message[] = res.data;
      set((state) => {
        const existing = state.messages[convId] || [];
        const merged = before
          ? [...msgs, ...existing]
          : msgs;
        return { messages: { ...state.messages, [convId]: merged }, isLoadingMsgs: false };
      });
      return msgs;
    } catch {
      set({ isLoadingMsgs: false });
      return [];
    }
  },

  addMessage: (msg) => {
    set((state) => {
      const existing = state.messages[msg.conversation_id] || [];
      if (existing.find(m => m.id === msg.id)) return state;
      return {
        messages: {
          ...state.messages,
          [msg.conversation_id]: [...existing, msg]
        }
      };
    });
    get().updateConvLastMessage(msg);
  },

  updateMessage: (patch) => {
    set((state) => {
      const msgs = state.messages[patch.conversation_id];
      if (!msgs) return state;
      return {
        messages: {
          ...state.messages,
          [patch.conversation_id]: msgs.map(m =>
            m.id === patch.id ? { ...m, ...patch } : m
          )
        }
      };
    });
  },

  updateConvLastMessage: (msg) => {
    set((state) => {
      const convs = state.conversations.map(c => {
        if (c.id !== msg.conversation_id) return c;
        const isActive = state.activeConvId === c.id;
        return {
          ...c,
          last_message: msg.content,
          last_message_type: msg.type,
          last_message_at: msg.created_at,
          last_sender_nickname: msg.sender_nickname,
          unread_count: isActive ? 0 : (c.unread_count || 0) + 1
        };
      });
      // Sort by last message time
      convs.sort((a, b) => (b.last_message_at || b.created_at) - (a.last_message_at || a.created_at));
      return { conversations: convs };
    });
  },

  decrementUnread: () => {},

  resetUnread: (convId) => {
    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === convId ? { ...c, unread_count: 0 } : c
      )
    }));
  },

  setTyping: (convId, userId, nickname, isTyping) => {
    set((state) => {
      const current = state.typingUsers[convId] || [];
      const filtered = current.filter(u => u.userId !== userId);
      return {
        typingUsers: {
          ...state.typingUsers,
          [convId]: isTyping ? [...filtered, { userId, nickname }] : filtered
        }
      };
    });
  },

  addConversation: (conv) => {
    set((state) => {
      const exists = state.conversations.find(c => c.id === conv.id);
      if (exists) return state;
      return { conversations: [conv, ...state.conversations] };
    });
  },

  updateUserStatus: (userId, status) => {
    set((state) => ({
      conversations: state.conversations.map(c => {
        if (c.type === 'private' && c.otherUser?.id === userId) {
          return { ...c, otherUser: { ...c.otherUser!, status } };
        }
        return c;
      })
    }));
  }
}));
