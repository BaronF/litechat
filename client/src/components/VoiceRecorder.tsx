import React, { useState, useRef, useEffect } from 'react';
import { Mic, Square, Send, X } from 'lucide-react';

interface Props {
  onSend: (blob: Blob, duration: number) => void;
  onCancel: () => void;
}

export default function VoiceRecorder({ onSend, onCancel }: Props) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        setBlob(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setDuration(0);
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } catch (err) {
      alert('无法访问麦克风，请检查权限');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  };

  const handleSend = () => {
    if (blob) {
      onSend(blob, duration);
    }
  };

  const handleCancel = () => {
    stopRecording();
    setBlob(null);
    setDuration(0);
    onCancel();
  };

  useEffect(() => {
    startRecording();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatDur = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-3 bg-white border-t border-gray-100 px-4 py-3 flex-shrink-0"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <button onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
        <X className="w-5 h-5" />
      </button>

      <div className="flex-1 flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-2.5">
        {isRecording ? (
          <>
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 20 }).map((_, i) => (
                <div
                  key={i}
                  className="w-0.5 bg-green-400 rounded-full animate-pulse"
                  style={{
                    height: `${8 + Math.random() * 16}px`,
                    animationDelay: `${i * 50}ms`
                  }}
                />
              ))}
            </div>
            <span className="text-sm font-mono text-gray-500">{formatDur(duration)}</span>
          </>
        ) : blob ? (
          <span className="text-sm text-gray-600">录音完成 {formatDur(duration)}</span>
        ) : (
          <span className="text-sm text-gray-400">准备录音...</span>
        )}
      </div>

      {isRecording ? (
        <button
          onClick={stopRecording}
          className="w-10 h-10 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center transition-colors shadow"
        >
          <Square className="w-4 h-4 text-white" />
        </button>
      ) : blob ? (
        <button
          onClick={handleSend}
          className="w-10 h-10 bg-green-500 hover:bg-green-600 rounded-full flex items-center justify-center transition-colors shadow"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      ) : null}
    </div>
  );
}
