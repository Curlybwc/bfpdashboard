import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/hooks/use-toast';

/**
 * Reusable continuous speech-to-text input for field capture.
 *
 * Usage:
 *   const speech = useSpeechInput(setText, () => text);
 *   <DictateButton {...speech} />
 */
export function useSpeechInput(
  onTextChange: (next: string) => void,
  getCurrentText: () => string,
) {
  const { toast } = useToast();
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef<any>(null);

  const supported =
    typeof window !== 'undefined' &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const stop = useCallback(() => {
    try {
      recognizerRef.current?.stop();
    } catch {
      /* noop */
    }
    setListening(false);
  }, []);

  const start = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: 'Voice not supported',
        description: 'This browser does not support voice input. Type instead.',
        variant: 'destructive',
      });
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    let finalText = getCurrentText();

    rec.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + transcript;
        else interim += transcript;
      }
      onTextChange(finalText + (interim ? ' ' + interim : ''));
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);

    try {
      rec.start();
      recognizerRef.current = rec;
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [getCurrentText, onTextChange, toast]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  useEffect(() => {
    return () => {
      try {
        recognizerRef.current?.stop();
      } catch {
        /* noop */
      }
    };
  }, []);

  return { listening, supported, start, stop, toggle };
}
