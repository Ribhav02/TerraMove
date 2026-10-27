import { useState, useEffect, useRef, useCallback } from 'react';

interface UseSpeechRecognitionReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useSpeechRecognition(
  onResultCallback?: (text: string) => void,
  lang: string = 'en-IN'
): UseSpeechRecognitionReturn {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const isSupported = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    if (!isSupported) return;

    const SpeechRecognitionClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    try {
      const recognition = new SpeechRecognitionClass();
      recognition.continuous = false; // Capture discrete voice command
      recognition.interimResults = true;
      recognition.lang = lang; // Configurable language (en-IN, hi-IN, etc.)

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let finalTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            setTranscript(event.results[i][0].transcript);
          }
        }

        if (finalTranscript) {
          const trimmed = finalTranscript.trim();
          setTranscript(trimmed);
          if (onResultCallback) {
            onResultCallback(trimmed);
          }
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setError('Microphone permission was denied. Please allow microphone access or use text input.');
        } else if (event.error === 'no-speech') {
          setError('No speech was detected. Please try speaking again.');
        } else if (event.error === 'audio-capture') {
          setError('No microphone found or audio capture failed.');
        } else if (event.error === 'network') {
          setError('Speech recognition network error. Please try again or use text commands.');
        } else {
          setError(`Speech recognition notice: ${event.error}`);
        }
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    } catch (e: any) {
      console.warn('SpeechRecognition initialization error:', e);
      setError('Could not initialize browser speech recognition.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [isSupported, onResultCallback, lang]);

  const startListening = useCallback(() => {
    if (!isSupported) {
      setError('Speech recognition is not supported in this browser. Please use text commands.');
      return;
    }
    setError(null);
    setTranscript('');
    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
        recognitionRef.current.start();
      }
    } catch (e: any) {
      console.warn('Error starting speech recognition:', e);
      setIsListening(false);
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        // ignore
      }
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}

