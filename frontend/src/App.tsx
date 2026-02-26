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

function History({ size, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M3 3v5h5" />
      <path d="M3.2 13a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M12 7v5l3 2" />
    </IconBase>
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

function RotateCcw({ size, className }: IconProps) {
  return (
    <IconBase size={size} className={className}>
      <path d="M3 2v6h6" />
      <path d="M3.3 8.7A9 9 0 1 0 7 4.6L3 8" />
    </IconBase>
  );
}

type Stage = 'thinking' | 'verifying' | 'correcting' | 'finalizing' | null;

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  thoughtLog?: string[];
  justification?: string;
}

const statusCopy: Record<Exclude<Stage, null>, string> = {
  thinking: 'Parsing prompt vectors',
  verifying: 'Cross-checking assumptions',
  correcting: 'Self-correction feedback loop active',
  finalizing: 'Rendering final response',
};

export default function AgentUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Stage>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [history] = useState([
    { id: 'logic', label: 'Prior Logic Test', meta: 'Constraint Replay 021' },
    { id: 'vector', label: 'Vector Search Debug', meta: 'Embedding Drift Probe' },
    { id: 'policy', label: 'Routing Patch', meta: 'Fallback Policy Audit' },
    { id: 'perf', label: 'Latency Trim Run', meta: 'Socket Throughput Pass' },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or status changes
  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, status]);

  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMsg: Message = { id: Date.now().toString(), text: input, sender: 'user' };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    
    // Simulate the Backend Agent Loop
    simulateAgentLogic(input);
  };

  const simulateAgentLogic = async (_prompt: string) => {
    setStatus('thinking');
    await new Promise(r => setTimeout(r, 1500));
    
    setStatus('verifying');
    await new Promise(r => setTimeout(r, 1200));
    
    setStatus('correcting'); // The "Self-Correction" phase
    await new Promise(r => setTimeout(r, 1800));
    
    setStatus('finalizing');
    await new Promise(r => setTimeout(r, 1000));

    const aiMsg: Message = {
      id: (Date.now() + 1).toString(),
      sender: 'ai',
      text: "The optimal route is to use an asynchronous event-bus pattern.",
      justification: "This route was chosen because it decouples the Pinecone ingestion from the user-facing response stream, reducing perceived latency by 40%."
    };
    
    setMessages(prev => [...prev, aiMsg]);
    setStatus(null);
  };

  return (
    <div className="app-root relative min-h-screen overflow-hidden bg-[#020617] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="animate-orbfloat absolute -left-24 -top-20 h-72 w-72 rounded-full bg-cyan-400/25 blur-3xl" />
        <div className="animate-orbfloat-delayed absolute right-[-90px] top-1/3 h-64 w-64 rounded-full bg-emerald-300/20 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(15,23,42,0.9),rgba(2,132,199,0.08),rgba(15,23,42,0.95))]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.22)_1px,transparent_1px),linear-gradient(to_right,rgba(148,163,184,0.18)_1px,transparent_1px)] [background-size:34px_34px]" />
      </div>

      {isSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-[1px] sm:hidden"
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
          } fixed inset-y-3 left-3 overflow-hidden rounded-[24px] border border-cyan-300/20 bg-slate-950/75 backdrop-blur-xl transition-all duration-300 sm:static sm:inset-auto`}
        >
          <div className="flex h-full flex-col">
            <div className="border-b border-cyan-200/15 p-5">
              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-cyan-300/25 bg-cyan-300/10 p-2">
                  <History size={16} className="text-cyan-200" />
                </div>
                <div>
                  <p className="brand-font text-[11px] uppercase tracking-[0.28em] text-cyan-100/90">Memory Vault</p>
                  <p className="mt-1 text-xs text-slate-400">Session snapshots</p>
                </div>
              </div>
            </div>

            <div className="scrollbar-thin flex-1 overflow-y-auto p-3">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="group mb-2 w-full rounded-2xl border border-transparent bg-slate-900/70 p-3 text-left transition hover:-translate-y-0.5 hover:border-cyan-200/30 hover:bg-slate-900"
                >
                  <p className="brand-font text-sm text-slate-100">{item.label}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-cyan-200/70">{item.meta}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="relative flex min-h-[calc(100vh-1.5rem)] flex-1 flex-col rounded-[28px] border border-slate-700/70 bg-slate-900/65 backdrop-blur-xl sm:min-h-[calc(100vh-2.5rem)]">
          <button
            type="button"
            onClick={() => setSidebarOpen(!isSidebarOpen)}
            className="absolute left-4 top-4 z-20 rounded-xl border border-cyan-200/25 bg-slate-900/80 p-2 text-cyan-100 transition hover:bg-cyan-300/20"
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>

          <header className="border-b border-slate-700/60 px-6 pb-5 pt-16 sm:px-8 sm:pt-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-200/80">Self-Correction Protocol</p>
                <h1 className="brand-font mt-2 text-2xl leading-tight text-slate-50 sm:text-[2rem]">Cognitive Relay Console</h1>
                <p className="mt-2 max-w-2xl text-sm text-slate-300/85">
                  Interrogate prompts, route through correction stages, and surface reasoning traces in a single live channel.
                </p>
              </div>
              <div className="hidden rounded-full border border-emerald-200/25 bg-emerald-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200 sm:inline-flex">
                Live
              </div>
            </div>
          </header>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-8">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
              {messages.map((m, index) => (
                <div
                  key={m.id}
                  className={`message-entry flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  style={{ animationDelay: `${index * 85}ms` }}
                >
                  <div
                    className={`max-w-[88%] rounded-2xl border p-4 sm:max-w-[78%] ${
                      m.sender === 'user'
                        ? 'border-cyan-300/40 bg-gradient-to-br from-cyan-300 via-sky-400 to-blue-500 text-slate-900 shadow-[0_10px_28px_rgba(14,165,233,0.35)]'
                        : 'border-slate-600/80 bg-slate-900/75 text-slate-100 shadow-[0_10px_24px_rgba(2,6,23,0.45)]'
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{m.text}</p>
                    {m.justification && (
                      <div className="mt-3 border-t border-slate-600/80 pt-3 text-xs text-emerald-300/90">
                        <span className="brand-font uppercase tracking-[0.16em] text-emerald-200">Reasoning</span>
                        <p className="mt-1 leading-relaxed text-emerald-100/80">{m.justification}</p>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {status && (
                <div className="message-entry flex justify-start">
                  <div className="inline-flex items-center gap-3 rounded-full border border-cyan-300/30 bg-cyan-300/10 px-4 py-2 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
                    <span className="relative flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300/70" />
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-cyan-200" />
                    </span>
                    <span className="text-xs uppercase tracking-[0.17em] text-cyan-100/95">
                      {status === 'correcting' && <RotateCcw size={13} className="mr-1 inline animate-[spin_1.6s_linear_infinite]" />}
                      {statusCopy[status]}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-slate-700/60 p-4 sm:p-6">
            <div className="mx-auto w-full max-w-4xl">
              <div className="relative rounded-2xl border border-cyan-200/20 bg-slate-950/80 p-2 shadow-[0_0_40px_rgba(14,165,233,0.1)]">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                  placeholder="Inject a prompt for self-correcting analysis..."
                  className="w-full rounded-xl bg-transparent px-4 py-3 pr-14 text-sm text-slate-100 outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={handleSend}
                  className="group absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-cyan-400 p-2 text-slate-900 transition hover:bg-cyan-300"
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
