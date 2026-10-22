import React, { useState } from 'react';
import { Play, Pause, ExternalLink, FileVideo } from 'lucide-react';
import { Message } from '../types';
import { formatTime, formatDuration } from '../utils/format';
import { useAuthStore } from '../store/authStore';

interface Props {
  message: Message;
  showAvatar: boolean;
  isGroup: boolean;
}

function ImageMessage({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <img
        src={url}
        alt="图片"
        className="max-w-[200px] max-h-[200px] rounded-xl cursor-pointer object-cover shadow"
        onClick={() => setOpen(true)}
        loading="lazy"
      />
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
          onClick={() => setOpen(false)}
        >
          <img src={url} alt="图片预览" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg" />
        </div>
      )}
    </>
  );
}

function VideoMessage({ url }: { url: string }) {
  return (
    <div className="relative">
      <video
        src={url}
        controls
        className="max-w-[250px] max-h-[180px] rounded-xl shadow"
        preload="metadata"
      />
    </div>
  );
}

function VoiceMessage({ url, duration, isSelf }: { url: string; duration?: number | null; isSelf: boolean }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = React.useRef<HTMLAudioElement>(null);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer min-w-[100px] ${
        isSelf ? 'bg-green-400' : 'bg-gray-200'
      }`}
      onClick={toggle}
    >
      <button className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${isSelf ? 'bg-green-600' : 'bg-gray-400'}`}>
        {playing
          ? <Pause className="w-3.5 h-3.5 text-white" />
          : <Play className="w-3.5 h-3.5 text-white ml-0.5" />
        }
      </button>
      <div className="flex-1 flex items-center gap-0.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className={`w-0.5 rounded-full ${isSelf ? 'bg-green-200' : 'bg-gray-400'}`}
            style={{ height: `${8 + Math.sin(i * 1.5) * 6}px` }}
          />
        ))}
      </div>
      {duration && (
        <span className={`text-xs flex-shrink-0 ${isSelf ? 'text-green-100' : 'text-gray-500'}`}>
          {formatDuration(duration)}
        </span>
      )}
      <audio ref={audioRef} src={url} onEnded={() => setPlaying(false)} />
    </div>
  );
}

function LinkMessage({ content, title, description, image }: {
  content: string; title?: string | null; description?: string | null; image?: string | null;
}) {
  return (
    <a
      href={content}
      target="_blank"
      rel="noopener noreferrer"
      className="block max-w-[260px] border border-gray-200 rounded-xl overflow-hidden hover:border-green-300 transition-colors bg-white"
    >
      {image && (
        <img src={image} alt="" className="w-full h-28 object-cover" />
      )}
      <div className="p-3">
        {title && <p className="text-sm font-medium text-gray-800 line-clamp-2 mb-1">{title}</p>}
        {description && <p className="text-xs text-gray-400 line-clamp-2 mb-2">{description}</p>}
        <div className="flex items-center gap-1 text-xs text-green-600">
          <ExternalLink className="w-3 h-3" />
          <span className="truncate">{content.slice(0, 40)}...</span>
        </div>
      </div>
    </a>
  );
}

export default function MessageBubble({ message, showAvatar, isGroup }: Props) {
  const { user } = useAuthStore();
  const isSelf = message.sender_id === user?.id;
  const textParts = message.content.split(/(@[^\s@]+)/g);

  return (
    <div className={`flex items-end gap-2 ${isSelf ? 'flex-row-reverse' : 'flex-row'}`}>
      {/* Avatar placeholder */}
      {isGroup && (
        <div className="w-8 flex-shrink-0">
          {showAvatar && (
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
              isSelf ? 'bg-green-400' : 'bg-blue-400'
            }`}>
              {(message.sender_nickname || '?')[0].toUpperCase()}
            </div>
          )}
        </div>
      )}

      <div className={`flex flex-col max-w-[75%] ${isSelf ? 'items-end' : 'items-start'}`}>
        {/* Sender name (group only, non-self) */}
        {isGroup && !isSelf && showAvatar && (
          <span className="text-xs text-gray-400 mb-1 px-1">{message.sender_nickname}</span>
        )}

        {/* Bubble */}
        <div className={`rounded-2xl ${
          message.type === 'text'
            ? isSelf
              ? 'bg-green-500 text-white px-4 py-2.5'
              : 'bg-white border border-gray-100 text-gray-800 px-4 py-2.5 shadow-sm'
            : ''
        }`}>
          {message.type === 'text' && (
            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
              {textParts.map((part, index) => part.startsWith('@') && message.mention_user_ids?.length
                ? <span key={index} className={isSelf ? 'font-semibold underline decoration-green-200' : 'font-semibold text-green-700'}>{part}</span>
                : part
              )}
            </p>
          )}
          {message.type === 'image' && message.file_url && (
            <ImageMessage url={message.file_url} />
          )}
          {message.type === 'video' && message.file_url && (
            <VideoMessage url={message.file_url} />
          )}
          {message.type === 'voice' && message.file_url && (
            <VoiceMessage url={message.file_url} duration={message.duration} isSelf={isSelf} />
          )}
          {message.type === 'link' && (
            <LinkMessage
              content={message.content}
              title={message.link_title}
              description={message.link_description}
              image={message.link_image}
            />
          )}
        </div>

        {/* Time */}
        <span className="text-xs text-gray-400 mt-1 px-1">{formatTime(message.created_at)}</span>
      </div>
    </div>
  );
}
