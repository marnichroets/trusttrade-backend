import { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Loader2 } from 'lucide-react';
import api from '../utils/api';

const C = {
  bg:      '#0A0E14',
  surface: '#1C2128',
  bubble:  '#0D1117',
  border:  '#2D333B',
  accent:  '#38BDF8',
  text:    '#E6EDF3',
  sub:     '#8B949E',
  mono:    "'JetBrains Mono', 'Fira Code', 'Courier New', monospace",
  sans:    "'Space Grotesk', -apple-system, BlinkMacSystemFont, sans-serif",
};

const GREETING = "Hi! I'm the TrustTrade support assistant. How can I help you today?";

export default function SupportChat() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (open && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    const history = messages.slice(1);
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.post('/ai/chat', { message: msg, history });
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting. Please email support@trusttradesa.co.za.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      <button
        onClick={() => setOpen(o => !o)}
        data-testid="support-chat-btn"
        title="Support Chat"
        style={{
          position: 'fixed', bottom: 72, right: 20, zIndex: 1001,
          width: 46, height: 46, borderRadius: '50%',
          background: C.accent, border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(56,189,248,0.35)',
          transition: 'transform 0.15s',
        }}
      >
        {open ? <X size={18} color={C.bg} /> : <MessageSquare size={18} color={C.bg} />}
      </button>

      {open && (
        <div
          data-testid="support-chat-panel"
          style={{
            position: 'fixed', bottom: 130, right: 20, zIndex: 1000,
            width: 308, background: C.surface,
            border: `1px solid ${C.border}`, borderRadius: 10,
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            fontFamily: C.sans,
          }}
        >
          <div style={{
            padding: '11px 14px', borderBottom: `1px solid ${C.border}`,
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
          }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>TrustTrade Support</span>
          </div>

          <div style={{
            overflowY: 'auto', padding: '12px 12px',
            display: 'flex', flexDirection: 'column', gap: 8,
            minHeight: 180, maxHeight: 260,
          }}>
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '82%', padding: '7px 11px', borderRadius: 8,
                  fontSize: 13, lineHeight: 1.55,
                  background: msg.role === 'user' ? C.accent : C.bubble,
                  color: msg.role === 'user' ? C.bg : C.text,
                  fontWeight: msg.role === 'user' ? 600 : 400,
                }}>
                  {msg.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex' }}>
                <div style={{ padding: '7px 11px', borderRadius: 8, background: C.bubble, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Loader2 size={11} color={C.sub} style={{ animation: 'spin 0.8s linear infinite' }} />
                  <span style={{ fontSize: 12, color: C.sub }}>Thinking…</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div style={{
            padding: '9px 10px', borderTop: `1px solid ${C.border}`,
            display: 'flex', gap: 7, flexShrink: 0,
          }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a question…"
              rows={1}
              style={{
                flex: 1, padding: '7px 10px', borderRadius: 6,
                border: `1px solid ${C.border}`, background: C.bubble,
                color: C.text, fontFamily: C.sans, fontSize: 13,
                resize: 'none', outline: 'none',
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading}
              style={{
                width: 34, height: 34, borderRadius: 6, border: 'none',
                background: !input.trim() || loading ? C.border : C.accent,
                cursor: !input.trim() || loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, alignSelf: 'flex-end',
              }}
            >
              <Send size={13} color={!input.trim() || loading ? C.sub : C.bg} />
            </button>
          </div>
        </div>
      )}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
}
