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

export default function AgentUI() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Stage>(null);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [history] = useState(['Prior Logic Test', 'Vector Search Debug']); // Mock history
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
    <div className="flex h-screen bg-[#0f1117] text-gray-100 font-sans">
      {/* 1. COLLAPSIBLE SIDEBAR */}
      <aside className={`${isSidebarOpen ? 'w-72' : 'w-0'} transition-all duration-300 border-r border-gray-800 bg-[#090b0f] flex flex-col overflow-hidden`}>
        <div className="p-4 flex items-center gap-2 border-b border-gray-800">
          <History size={20} className="text-blue-400" />
          <span className="font-bold uppercase tracking-wider text-xs">Past Conversations</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {history.map((item, i) => (
            <div key={i} className="p-3 mb-1 rounded-lg hover:bg-gray-800 cursor-pointer text-sm text-gray-400 truncate">
              {item}
            </div>
          ))}
        </div>
      </aside>

      {/* MAIN CHAT AREA */}
      <main className="flex-1 flex flex-col relative">
        {/* Toggle Button */}
        <button 
          onClick={() => setSidebarOpen(!isSidebarOpen)}
          className="absolute left-4 top-4 z-10 p-2 bg-gray-800 rounded-md hover:bg-gray-700"
        >
          {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
        </button>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-6">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] p-4 rounded-2xl ${
                m.sender === 'user' ? 'bg-blue-600' : 'bg-gray-800 border border-gray-700'
              }`}>
                <p className="text-sm leading-relaxed">{m.text}</p>
                {m.justification && (
                  <div className="mt-3 pt-3 border-t border-gray-700 text-xs text-green-400 italic">
                    <strong>Reasoning:</strong> {m.justification}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* DYNAMIC STATUS INDICATOR */}
          {status && (
            <div className="flex justify-start items-center gap-3 text-blue-400 animate-pulse">
              <div className="w-2 h-2 bg-blue-400 rounded-full" />
              <span className="text-xs font-mono uppercase tracking-widest">
                {status === 'correcting' && <RotateCcw size={14} className="inline mr-2 animate-spin" />}
                Agent State: {status}...
              </span>
            </div>
          )}
        </div>

        {/* CHAT INPUT */}
        <div className="p-6 border-t border-gray-800 bg-[#0f1117]">
          <div className="max-w-4xl mx-auto relative">
            <input 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Enter prompt for self-correcting analysis..."
              className="w-full bg-gray-900 border border-gray-700 rounded-xl py-4 px-6 pr-14 focus:outline-none focus:border-blue-500 transition-colors"
            />
            <button 
              onClick={handleSend}
              className="absolute right-3 top-3 p-2 bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors"
            >
              <Send size={20} />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
