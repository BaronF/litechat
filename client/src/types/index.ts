export interface User {
  id: string;
  username: string;
  nickname: string;
  avatar: string | null;
  status?: 'online' | 'offline';
}

export type MessageType = 'text' | 'image' | 'video' | 'voice' | 'link';

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_nickname: string;
  sender_avatar: string | null;
  type: MessageType;
  content: string;
  file_url?: string | null;
  file_size?: number | null;
  duration?: number | null;
  link_title?: string | null;
  link_description?: string | null;
  link_image?: string | null;
  mention_user_ids?: string[];
  created_at: number;
}

export interface Conversation {
  id: string;
  type: 'private' | 'group';
  name?: string | null;
  avatar?: string | null;
  created_at: number;
  created_by?: string | null;
  last_message?: string | null;
  last_message_type?: MessageType | null;
  last_message_at?: number | null;
  last_sender_nickname?: string | null;
  unread_count?: number;
  mention_unread_count?: number;
  otherUser?: User;
}
