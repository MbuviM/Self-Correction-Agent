import { useState, useEffect, useCallback, useRef } from 'react';

export const useSocket = (url: string) => {
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    socketRef.current = new WebSocket(url);

    socketRef.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // Update the UI status (Thinking, Correcting, etc.)
      if (data.type === 'status') {
        setStatus(data.stage);
      }
      
      // Handle the final or intermediate responses
      if (data.type === 'final' || data.type === 'intermediate') {
        setMessages((prev) => [...prev, data]);
        setStatus(null);
      }
    };

    return () => socketRef.current?.close();
  }, [url]);

  const startAnalysis = useCallback((prompt: string) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'start_analysis', prompt }));
    }
  }, []);

  return { status, messages, startAnalysis };
};