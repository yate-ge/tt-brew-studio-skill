import { useState, useEffect, useRef } from 'react';
import { eventBus } from '../lib/eventBus';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const attemptsRef = useRef(0);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    let closedByCleanup = false;

    function connect() {
      if (closedByCleanup) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/ws`);

      ws.onopen = () => {
        setConnected(true);
        attemptsRef.current = 0;
      };

      ws.onclose = () => {
        setConnected(false);
        if (closedByCleanup) return;
        // Exponential backoff: 1s, 2s, 4s, 8s, max 10s
        const delay = Math.min(1000 * Math.pow(2, attemptsRef.current), 10000);
        attemptsRef.current++;
        reconnectTimerRef.current = window.setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (e) => {
        try {
          const { event, data } = JSON.parse(e.data);
          eventBus.emit(event, data);
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      wsRef.current = ws;
    }

    connect();
    return () => {
      closedByCleanup = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  return { connected };
}
