import React from 'react';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
  online?: boolean;
}

const sizeMap = {
  sm: 'w-9 h-9 text-sm',
  md: 'w-12 h-12 text-base',
  lg: 'w-16 h-16 text-xl'
};

const colors = [
  'bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400',
  'bg-teal-400', 'bg-blue-400', 'bg-indigo-400', 'bg-purple-400', 'bg-pink-400'
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash += name.charCodeAt(i);
  return colors[hash % colors.length];
}

export default function Avatar({ src, name, size = 'md', online }: AvatarProps) {
  const cls = sizeMap[size];
  const initial = name ? name[0].toUpperCase() : '?';
  const color = getColor(name || '?');

  return (
    <div className="relative flex-shrink-0">
      {src ? (
        <img
          src={src}
          alt={name}
          className={`${cls} rounded-full object-cover`}
        />
      ) : (
        <div className={`${cls} ${color} rounded-full flex items-center justify-center text-white font-bold`}>
          {initial}
        </div>
      )}
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${online ? 'bg-green-400' : 'bg-gray-300'}`} />
      )}
    </div>
  );
}
