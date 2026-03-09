import { useState, useEffect, useRef, type ReactNode } from 'react';

type IconProps = {
  size?: number;
  className?: string;
};

function IconBase({
  size = 20,
  className,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

function Send({ size, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </IconBase>
  );
}

function ChevronLeft({ size, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="m15 18-6-6 6-6" />
    </IconBase>
  );
}

function ChevronRight({ size, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="m9 18 6-6-6-6" />
    </IconBase>
  );
}

type Stage = 'thinking' | 'verifying' | 'correcting' | 'finalizing' | null;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
}

const statusCopy: Record<Exclude<Stage, null>, string> = {
  thinking: 'Thinking',
  verifying: 'Verifying',
  correcting: 'Self-correcting',
  finalizing: 'Finalizing',
};

function renderTextBlocks(text: string, keyPrefix: string): ReactNode[] {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  const nodes: ReactNode[] = [];

  blocks.forEach((block, index) => {
    if (block.startsWith('### ')) {
      nodes.push(
        <h3 key={`${keyPrefix}-h-${index}`} className="text-sm font-semibold text-slate-900">
          {block.slice(4).trim()}
        </h3>
      );
      return;
    }

    if (block.startsWith('## ')) {
      nodes.push(
        <h3 key={`${keyPrefix}-h2-${index}`} className="text-sm font-semibold text-slate-900">
          {block.slice(3).trim()}
        </h3>
      );
      return;
    }

    const orderedLines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^\d+\.\s+/.test(line));
    if (orderedLines.length > 0 && orderedLines.length === block.split('\n').filter((l) => l.trim()).length) {
      nodes.push(
        <ol key={`${keyPrefix}-ol-${index}`} className="list-decimal space-y-1 pl-5 text-sm leading-relaxed">
          {orderedLines.map((line, lineIndex) => (
            <li key={`${keyPrefix}-ol-li-${index}-${lineIndex}`}>{line.replace(/^\d+\.\s+/, '')}</li>
          ))}
        </ol>
      );
      return;
    }

    const bulletLines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[-*]\s+/.test(line));
    if (bulletLines.length > 0 && bulletLines.length === block.split('\n').filter((l) => l.trim()).length) {
      nodes.push(
        <ul key={`${keyPrefix}-ul-${index}`} className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          {bulletLines.map((line, lineIndex) => (
            <li key={`${keyPrefix}-ul-li-${index}-${lineIndex}`}>{line.replace(/^[-*]\s+/, '')}</li>
          ))}
        </ul>
      );
      return;
    }

    nodes.push(
      <p key={`${keyPrefix}-p-${index}`} className="whitespace-pre-wrap text-sm leading-relaxed">
        {block}
      </p>
    );
  });

  return nodes;
}

function renderMessageContent(message: Message): ReactNode {
  if (message.sender === 'user') {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>;
  }

  const nodes: ReactNode[] = [];
  const regex = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let codeIndex = 0;

  while ((match = regex.exec(message.text)) !== null) {
    const plainText = message.text.slice(lastIndex, match.index).trim();
    if (plainText) {
      nodes.push(
        <div key={`${message.id}-txt-${codeIndex}`} className="space-y-2">
          {renderTextBlocks(plainText, `${message.id}-txt-${codeIndex}`)}
        </div>
      );
    }

    const language = (match[1] || 'text').trim();
    const code = (match[2] || '').trim();
    nodes.push(
      <div key={`${message.id}-code-wrap-${codeIndex}`} className="space-y-1">
        {language && (
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-500">{language}</p>
        )}
        <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
          <code>{code}</code>
        </pre>
      </div>
    );

    lastIndex = regex.lastIndex;
    codeIndex += 1;
  }

  const trailingText = message.text.slice(lastIndex).trim();
  if (trailingText) {
    nodes.push(
      <div key={`${message.id}-trail`} className="space-y-2">
        {renderTextBlocks(trailingText, `${message.id}-trail`)}
      </div>
    );
  }

  if (nodes.length === 0) {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{message.text}</p>;
  }

  return <div className="space-y-3">{nodes}</div>;
}

export default function AgentUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Stage>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const socketUrl = (import.meta.env.VITE_WS_URL as string | undefined) || 'ws://localhost:8080';
    const ws = new WebSocket(socketUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onclose = () => {
      setIsConnected(false);
      setStatus(null);
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type?: string;
          stage?: string;
          content?: string;
        };

        if (payload.type === 'status') {
          const incomingStage = payload.stage;
          if (
            incomingStage === 'thinking' ||
            incomingStage === 'verifying' ||
            incomingStage === 'correcting' ||
            incomingStage === 'finalizing'
          ) {
            setStatus(incomingStage);
          }
          return;
        }

        if (payload.type === 'final') {
          const content = (payload.content || '').trim();
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-ai`,
              sender: 'ai',
              text: content || 'No response content returned.',
            },
          ]);
          setStatus(null);
        }
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `${Date.now()}-parse-error`,
            sender: 'ai',
            text: 'Received an invalid message from backend.',
          },
        ]);
      }
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, []);

  // Auto-scroll to bottom on new messages or status changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, status]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user' };
    setMessages(prev => [...prev, userMsg]);
    const prompt = input;
    setInput('');

    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-offline`,
          sender: 'ai',
          text: 'Backend is not connected. Start backend/server.ts on port 8080.',
        },
      ]);
      return;
    }

    ws.send(
      JSON.stringify({
        type: 'start_analysis',
        prompt,
      })
    );
  };

  return (
    <div className="app-root relative min-h-screen overflow-hidden bg-[#f5f7ff] text-slate-900">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orbfloat absolute -left-20 -top-20 h-72 w-72 rounded-full bg-fuchsia-300/45 blur-3xl" />
        <div className="animate-orbfloat-delayed absolute bottom-0 right-[-60px] h-80 w-80 rounded-full bg-cyan-300/45 blur-3xl" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.55),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.24),rgba(221,235,255,0.4))]" />
      </div>

      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-900/20 backdrop-blur-[1px] sm:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar overlay"
        />
      )}

      <div className="relative z-30 flex min-h-screen w-full gap-3 p-3 sm:p-5">
        <aside
          className={`${
            isSidebarOpen
              ? 'w-[min(82vw,320px)] translate-x-0 opacity-100 sm:w-80'
              : 'w-[min(82vw,320px)] -translate-x-[106%] opacity-0 sm:w-0 sm:translate-x-0 sm:opacity-100'
          } fixed inset-y-3 left-3 overflow-hidden rounded-[24px] border border-white/65 bg-white/80 backdrop-blur-xl transition-all duration-300 sm:static sm:inset-auto`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200/70 p-5">
              <p className="brand-font text-sm uppercase tracking-[0.22em] text-slate-700">Past Conversations</p>
            </div>

            <div className="flex flex-1 items-center justify-center p-6">
              <p className="text-center text-sm text-slate-500">Past conversations appear here.</p>
            </div>
          </div>
        </aside>

        <main className="relative flex min-h-[calc(100vh-1.5rem)] flex-1 flex-col rounded-[28px] border border-white/70 bg-white/75 backdrop-blur-xl sm:min-h-[calc(100vh-2.5rem)]">
          <header className="border-b border-slate-200/75 px-5 py-4 sm:px-8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(!isSidebarOpen)}
                  className="rounded-xl border border-slate-200 bg-white p-2 text-slate-700 transition hover:bg-slate-50"
                  aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                >
                  {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
                </button>
                <h1 className="brand-font text-xl text-slate-900 sm:text-2xl">Killua AI</h1>
              </div>
              <p className={`text-xs ${isConnected ? 'text-emerald-700' : 'text-rose-700'}`}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </p>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
              {messages.length === 0 && (
                <div className="message-entry flex justify-start">
                  <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-slate-500 shadow-[0_8px_22px_rgba(148,163,184,0.16)]">
                    Ask anything. The assistant will self-correct before finalizing.
                  </div>
                </div>
              )}

              {messages.map((m, index) => (
                <div
                  key={m.id}
                  className={`message-entry flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  style={{ animationDelay: `${index * 85}ms` }}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl border p-4 sm:max-w-[78%] ${
                      m.sender === 'user'
                        ? 'border-violet-200 bg-gradient-to-br from-violet-200 via-fuchsia-200 to-cyan-200 text-slate-900 shadow-[0_10px_26px_rgba(167,139,250,0.25)]'
                        : 'border-slate-200 bg-white/90 text-slate-800 shadow-[0_10px_24px_rgba(148,163,184,0.2)]'
                    }`}
                  >
                    {renderMessageContent(m)}
                  </div>
                </div>
              ))}

              {status && (
                <div className="message-entry flex justify-start">
                  <p className="text-xs italic text-purple-700">{statusCopy[status]}...</p>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-200/75 p-4 sm:p-6">
            <div className="mx-auto w-full max-w-4xl">
              <div className="relative rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(148,163,184,0.18)]">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Type your prompt..."
                  className="w-full rounded-xl bg-transparent px-4 py-3 pr-14 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  className="group absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-purple-700 p-2 text-white transition hover:bg-purple-800"
                  aria-label="Send prompt"
                >
                  <Send size={18} className="transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
