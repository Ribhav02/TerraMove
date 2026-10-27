import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSpeechSynthesisReturn {
  isSupported: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  speak: (text: string, onEnd?: () => void) => void;
  cancel: () => void;
  toggleMute: () => void;
}

export function useSpeechSynthesis(): UseSpeechSynthesisReturn {
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const isSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  useEffect(() => {
    if (!isSupported) return;

    const updateVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices.length) return;

      // Prefer Indian English or high quality British/US natural English
      const preferred =
        voices.find((v) => v.lang === 'en-IN' || v.lang.startsWith('en_IN')) ||
        voices.find((v) => v.lang === 'en-GB' || v.lang.startsWith('en_GB')) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0];

      voiceRef.current = preferred || null;
    };

    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [isSupported]);

  const cancel = useCallback(() => {
    if (isSupported) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!isSupported || isMuted || !text.trim()) {
        if (onEnd) onEnd();
        return;
      }

      // Cancel any ongoing utterance
      window.speechSynthesis.cancel();

      // Clean markdown characters like asterisks or brackets before speaking
      const cleanText = text
        .replace(/\*\*/g, '')
        .replace(/\*/g, '')
        .replace(/#/g, '')
        .replace(/`.*?`/g, '')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim();

      const utterance = new SpeechSynthesisUtterance(cleanText);
      if (voiceRef.current) {
        utterance.voice = voiceRef.current;
      }
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setIsSpeaking(true);
      };

      utterance.onend = () => {
        setIsSpeaking(false);
        if (onEnd) onEnd();
      };

      utterance.onerror = (e) => {
        // 'interrupted' is normal when canceled
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          console.warn('SpeechSynthesis error:', e.error);
        }
        setIsSpeaking(false);
        if (onEnd) onEnd();
      };

      window.speechSynthesis.speak(utterance);
    },
    [isSupported, isMuted]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (next && isSupported) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      return next;
    });
  }, [isSupported]);

  return {
    isSupported,
    isSpeaking,
    isMuted,
    speak,
    cancel,
    toggleMute,
  };
}

