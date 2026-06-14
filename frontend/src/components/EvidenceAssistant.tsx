import React, { useState, useRef, useEffect, useLayoutEffect } from "react";
import { 
  Send, 
  Sparkles, 
  ChevronRight, 
  User, 
  Terminal,
  Cpu,
  FileText,
  Activity
} from "lucide-react";

export interface AssistantChartData {
  type: "bar";
  title: string;
  items: Array<{ label: string; value: number; tone?: "good" | "warn" | "bad"; suffix?: string }>;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  followUps?: string[];
  chart?: AssistantChartData | null;
}

interface EvidenceAssistantProps {
  onSendMessage: (text: string) => Promise<{ answer: string; followUps: string[]; chart: AssistantChartData | null }>;
  prefilledPrompt?: string | null;
  setPrefilledPrompt?: (val: string | null) => void;
}

const CHART_TONE_CLASSES: Record<string, string> = {
  good: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-red-500",
};

/** Render inline **bold** segments as real <strong> tags so raw asterisks never appear. */
function renderInline(text: string): React.ReactNode {
  if (!text.includes("**")) return text;
  const parts = text.split("**");
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i} className="font-bold text-neutral-900">{part}</strong> : part));
}

function AnswerChart({ chart }: { chart: AssistantChartData }) {
  const maxValue = Math.max(1, ...chart.items.map((item) => item.value));
  return (
    <div className="mt-3 border border-neutral-200 rounded-xl bg-white p-4">
      <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 font-bold block mb-3">
        📊 {chart.title}
      </span>
      <div className="space-y-2">
        {chart.items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-neutral-600 w-28 shrink-0 truncate" title={item.label}>
              {item.label}
            </span>
            <div className="flex-1 bg-neutral-100 rounded-full h-4 overflow-hidden">
              <div
                className={`h-4 rounded-full transition-all duration-500 ${CHART_TONE_CLASSES[item.tone || ""] || "bg-neutral-800"}`}
                style={{ width: `${Math.max(3, (item.value / maxValue) * 100)}%` }}
              ></div>
            </div>
            <span className="text-[10px] font-mono font-bold text-neutral-800 w-16 shrink-0">
              {item.value}{item.suffix || ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EvidenceAssistant({ onSendMessage, prefilledPrompt, setPrefilledPrompt }: EvidenceAssistantProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial-msg",
      role: "assistant",
      content: `👋 Hi! I'm your Project Intelligence Assistant.

I can help you understand everything about your project using live data:

📦 Materials — status, batches, suppliers, readiness
📜 Certificates — expired, expiring, valid
✅ Approvals — pending, overdue, completed
🚚 Deliveries — delays, expected dates, suppliers
📱 QR Scans — scan history, verification results
👥 Team — members, roles, responsibilities
📊 Reports — project health, executive summaries, risk analysis

Just ask me anything in plain language! Try one of the prompts below to get started.`,
      timestamp: new Date().toISOString()
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const hasUserInteracted = useRef(false);
  // Reserves empty space below the newest exchange so the latest question can
  // always scroll to the TOP of the chat window (standard chat-app behavior).
  const [bottomSpacer, setBottomSpacer] = useState(0);

  const autoSuggestedPrompts = [
    { label: "📊 Project Health", text: "How is the project doing overall?" },
    { label: "📦 Material Status", text: "Show me all materials and their status" },
    { label: "⚠️ Project Risks", text: "What are the current project risks?" },
    { label: "🚚 Delivery Delays", text: "Which deliveries are delayed?" },
    { label: "📜 Certificates", text: "Show certificate status" },
    { label: "✅ Approvals", text: "What approvals are pending?" },
    { label: "📱 QR Scans", text: "Show recent QR scan activity" },
    { label: "👥 Team Members", text: "Who are the team members?" },
    { label: "📦 Product Passports", text: "Show product passport summary" },
    { label: "🔍 What to Fix First", text: "What should we fix first today?" },
    { label: "📜 Audit History", text: "Show recent audit activity" },
    { label: "❓ Help", text: "What can you help me with?" },
  ];

  // Pin the latest QUESTION to the top of the chat window. To make that
  // physically possible we first reserve a spacer below the newest exchange
  // (so there's room to scroll it up), then scroll the question to the top.
  useLayoutEffect(() => {
    if (!hasUserInteracted.current) return;
    const container = chatContainerRef.current;
    if (!container || messages.length === 0) return;

    // Anchor on the user's most recent question (fall back to last message).
    const anchorMsg = [...messages].reverse().find((m) => m.role === "user") ?? messages[messages.length - 1];
    const anchorId = anchorMsg.id;
    const PAD = 8;

    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(`chat-msg-${anchorId}`);
      if (!el) return;
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      // Anchor's offset from the top of the scrollable content.
      const anchorPos = container.scrollTop + (eRect.top - cRect.top);
      // Real content height below the anchor, excluding the current spacer.
      const realBelow = container.scrollHeight - bottomSpacer - anchorPos;
      const needed = container.clientHeight - PAD;
      const nextSpacer = realBelow < needed ? Math.ceil(needed - realBelow) : 0;

      if (Math.abs(nextSpacer - bottomSpacer) > 1) {
        setBottomSpacer(nextSpacer);
        // Scroll after the spacer is committed to the DOM.
        requestAnimationFrame(() => { container.scrollTop = Math.max(0, anchorPos - PAD); });
      } else {
        container.scrollTop = Math.max(0, anchorPos - PAD);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [messages, isGenerating]);

  // Handle CommandCenter/Dashboard Ask AI redirection prefill
  useEffect(() => {
    if (prefilledPrompt) {
      setInputText(prefilledPrompt);
      handleSubmit(undefined, prefilledPrompt);
      if (setPrefilledPrompt) {
        setPrefilledPrompt(null);
      }
    }
  }, [prefilledPrompt]);

  const handleSubmit = async (e?: React.FormEvent, customText?: string) => {
    e?.preventDefault();
    const query = (customText || inputText || (e ? inputText : "")).trim();
    if (!query || isGenerating) return;

    if (!customText) setInputText("");

    // Add User message
    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      role: "user",
      content: query,
      timestamp: new Date().toISOString()
    };
    hasUserInteracted.current = true;
    setMessages(prev => [...prev, userMsg]);
    setIsGenerating(true);

    try {
      const response = await onSendMessage(query);

      const assistantMsg: Message = {
        id: `ast-${Date.now()}`,
        role: "assistant",
        content: response.answer,
        timestamp: new Date().toISOString(),
        followUps: response.followUps.length > 0 ? response.followUps : undefined,
        chart: response.chart,
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: `err-${Date.now()}`,
        role: "assistant",
        content: `**Error connecting to audit node:** Unable to execute query. ${err?.message || "Please check server connectivity."}`,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div id="evidence-assistant-tab" className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 bg-neutral-50 transition-all">
      
      {/* 1. EXECUTIVE SUMMARY HEADER */}
      <section id="assistant-executive-header" className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200 pb-5 gap-4">
        <div>
          <span className="text-[10px] font-mono premium-accent-bg px-2.5 py-1 rounded font-bold uppercase tracking-widest">
            Module 06 : Operational Intelligence AI
          </span>
          <h2 className="text-3xl font-extrabold tracking-tighter premium-text-primary font-sans mt-2.5">
            Evidence Assistant
          </h2>
          <p className="text-xs premium-text-secondary mt-1">
            ERP evidence assistant for material readiness, procurement, compliance, approvals, deliveries, audit, and QR scan history.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] premium-bg-sub premium-text-primary border premium-border font-mono font-bold uppercase tracking-widest py-1.5 px-3.5 rounded-xl shadow-xs self-start md:self-auto">
          <Terminal className="w-3.5 h-3.5" />
          <span>ERP EVIDENCE MODE</span>
        </div>
      </section>

      {/* 2. CONTEXT PANEL */}
      <section id="assistant-context-panel" className="bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs grid grid-cols-1 md:grid-cols-4 gap-6">
        <div>
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">PROJECT FEEDS CONNECTED</span>
          <p className="text-xs font-bold text-neutral-900 mt-1.5 truncate">Selected backend project</p>
          <span className="text-[10px] text-neutral-550 block font-mono">Live project API context</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">SYSTEM METRICS TRUST</span>
          <span className="text-xs font-semibold text-neutral-805 mt-1.5 flex items-center gap-1">
            <FileText className="w-4 h-4 text-emerald-500" /> Database records verified
          </span>
          <span className="text-[10px] text-neutral-450 font-mono">Materials, suppliers, approvals, scans</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150">
          <span className="text-[9px] font-mono text-neutral-400 font-bold block uppercase tracking-wider">RESOLVED THREAD STATUS</span>
          <p className="text-xs font-bold text-neutral-808 mt-1.5">
            {messages.length} conversation blocks
          </p>
          <span className="text-[10px] text-neutral-450 font-mono">Real-time reasoning logs</span>
        </div>
        <div className="md:border-l md:pl-6 border-neutral-150 flex flex-col justify-between">
          <span className="text-[9px] font-mono text-[#a3a3a3] font-bold block uppercase tracking-wider">ANSWER MODE</span>
          <span className="font-mono text-[9px] py-1 px-3 bg-neutral-100 border text-neutral-705 rounded-full uppercase self-start mt-1.5 font-bold">
            Backend Evidence First
          </span>
        </div>
      </section>

      {/* 3. CORE VIEW: THE CONVERSATIONAL STREAM WORKSPACE & INPUT PANEL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Left Big Panel: The chat interaction workspace */}
        <div className="lg:col-span-8 bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b pb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#a3a3a3] font-mono flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-black animate-pulse" /> Live Reasoning Stream
            </h3>
            <span className="text-[9px] font-mono text-neutral-400 font-semibold">Ready for context inputs</span>
          </div>

          <div ref={chatContainerRef} className="space-y-6 max-h-[550px] overflow-y-auto pr-2">
            {messages.map((msg) => {
              const IsAssistant = msg.role === "assistant";
              return (
                <div 
                  key={msg.id} 
                  id={`chat-msg-${msg.id}`}
                  className={`flex gap-4 max-w-4xl ${IsAssistant ? "mr-auto" : "ml-auto flex-row-reverse"}`}
                >
                  {/* Icon profile */}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border ${
                    IsAssistant 
                      ? "bg-neutral-900 border-neutral-850 text-white" 
                      : "bg-white border-neutral-300 text-neutral-800"
                  }`}>
                    {IsAssistant ? (
                      <Sparkles className="w-4 h-4 text-white" />
                    ) : (
                      <User className="w-4 h-4 text-neutral-700" />
                    )}
                  </div>

                  <div className={`rounded-xl p-4 text-xs leading-relaxed border ${
                    IsAssistant 
                      ? "bg-neutral-50/50 border-neutral-200 text-neutral-700 shadow-sm" 
                      : "bg-[#18181b] text-white border-neutral-800 shadow-sm"
                  }`}>
                    <div className="font-sans space-y-0.5">
                      {msg.content.split("\n").map((line, idx) => {
                        const trimmed = line.trim();
                        if (!trimmed) return <div key={idx} className="h-2" />;
                        if (trimmed.startsWith('---')) return <hr key={idx} className="border-neutral-200 my-2" />;
                        if (trimmed.startsWith("### ")) {
                          return <h4 key={idx} className="font-bold text-neutral-900 border-b border-neutral-100 pb-1 mt-3 mb-1 text-sm" style={{ marginTop: idx === 0 ? 0 : undefined }}>{trimmed.replace("### ", "")}</h4>;
                        }
                        const emojiHeaderMatch = trimmed.match(/^([\p{Emoji}\u200d\uFE0F]+)\s+(.+)$/u);
                        if (emojiHeaderMatch && (trimmed.endsWith(':') || trimmed.includes(' — ') || trimmed.includes(' - '))) {
                          return <p key={idx} className="font-semibold text-neutral-900 mt-2" style={{ marginTop: idx === 0 ? 0 : undefined }}>{renderInline(trimmed)}</p>;
                        }
                        if (trimmed.startsWith('•') || trimmed.startsWith('- ') || trimmed.startsWith('· ')) {
                          return <p key={idx} className="pl-4 text-neutral-700">{renderInline(trimmed)}</p>;
                        }
                        if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
                          return <p key={idx} className="font-bold text-neutral-900 mt-2">{trimmed.replace(/\*\*/g, '')}</p>;
                        }
                        if (trimmed.startsWith('👉') || trimmed.startsWith('💡') || trimmed.startsWith('🎯')) {
                          return <p key={idx} className="font-medium text-neutral-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-1">{renderInline(trimmed)}</p>;
                        }
                        return <p key={idx}>{renderInline(trimmed)}</p>;
                      })}
                    </div>
                    {msg.chart && msg.chart.items.length > 0 && <AnswerChart chart={msg.chart} />}
                    {msg.followUps && msg.followUps.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-neutral-100">
                        <span className="text-[9px] font-mono text-neutral-400 w-full mb-1">FOLLOW-UP QUESTIONS</span>
                        {msg.followUps.map((fu, i) => (
                          <button
                            key={i}
                            onClick={() => handleSubmit(undefined, fu)}
                            className="text-[10px] bg-white border border-neutral-200 hover:border-black text-neutral-600 hover:text-black px-2.5 py-1 rounded-full transition-all cursor-pointer"
                          >
                            {fu}
                          </button>
                        ))}
                      </div>
                    )}
                    <span className="block text-[8.5px] mt-2 font-mono text-neutral-450">
                      {new Date(msg.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              );
            })}

            {isGenerating && (
              <div className="flex gap-4 max-w-lg mr-auto animate-pulse">
                <div className="w-8 h-8 rounded-full bg-neutral-905 border border-neutral-850 text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 animate-spin" />
                </div>
                <div className="bg-neutral-50 border border-neutral-200 rounded-2xl p-4 text-xs text-neutral-450 flex items-center gap-1.5 shadow-sm">
                  <span className="flex h-1.5 w-1.5 rounded-full bg-black animate-bounce" />
                  <span className="flex h-1.5 w-1.5 rounded-full bg-black animate-bounce delay-100" />
                  <span className="flex h-1.5 w-1.5 rounded-full bg-black animate-bounce delay-200" />
                  <span className="font-mono text-[9px] uppercase tracking-wider font-bold">Analyzing project data...</span>
                </div>
              </div>
            )}

            <div style={{ height: bottomSpacer }} aria-hidden="true" />
            <div ref={chatEndRef} />
          </div>

          {/* Quick Triggers Suggesion Ribbon */}
          <div className="space-y-2.5 pt-4 border-t border-neutral-150">
            <p className="text-[10px] uppercase tracking-widest font-bold text-neutral-400 font-mono">
            ERP Evidence Prompts
            </p>
            <div className="flex flex-wrap gap-2">
              {autoSuggestedPrompts.map((p, idx) => (
                <button
                  key={idx}
                  id={`assistant-suggested-btn-${idx}`}
                  onClick={() => handleSubmit(undefined, p.text)}
                  className="bg-white border border-neutral-200 hover:border-black text-neutral-700 hover:text-black text-[11px] py-1 px-3 rounded-full font-medium transition-all shadow-xs flex items-center gap-1 cursor-pointer"
                >
                  <span>{p.label}</span>
                  <ChevronRight className="w-3 h-3 text-neutral-400 shrink-0" />
                </button>
              ))}
            </div>
          </div>

          {/* Input text controls */}
          <form onSubmit={handleSubmit} className="flex gap-3 pt-4 border-t border-neutral-150">
            <input 
              type="text"
              id="assistant-input-box"
              placeholder="Ask anything about this project, a material, supplier, approval, delivery, scan, or ERP risk..."
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              disabled={isGenerating}
              className="bg-neutral-50 border border-neutral-200 focus:bg-white rounded-xl px-5 py-3 text-xs flex-1 focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
            />
            <button
              type="submit"
              id="assistant-submit-btn"
              disabled={!inputText.trim() || isGenerating}
              className="bg-black hover:bg-neutral-850 text-white font-bold rounded-xl text-[10.5px] px-5 py-3 flex items-center gap-1.5 shadow transition-all disabled:opacity-40 uppercase font-mono tracking-wider cursor-pointer"
            >
              <span>Evaluate</span>
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>

        </div>

        {/* Right Side Panel: Suggested Quick Assistant Resources */}
        <div className="lg:col-span-4 bg-white border border-neutral-200 rounded-2xl p-5 shadow-xs space-y-4">
          <h3 className="text-xs font-mono font-bold uppercase tracking-widest text-[#a3a3a3] border-b pb-3">
            Evidence Context Sources
          </h3>

          <div className="space-y-3.5">
            <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1.5 text-xs text-neutral-700">
              <span className="text-[9.5px] font-mono text-neutral-400 font-bold block uppercase">PRIMARY RECORDS</span>
              <p className="font-bold text-neutral-900 leading-tight">Materials and product passports</p>
              <p className="text-neutral-500 text-[11px]">Names, batches, suppliers, categories, quantities, readiness status, and passport scores.</p>
            </div>

            <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1.5 text-xs text-neutral-700">
              <span className="text-[9.5px] font-mono text-neutral-400 font-bold block uppercase">RISK RECORDS</span>
              <p className="font-bold text-emerald-800 leading-tight">Certificates, approvals, deliveries, suppliers, scans</p>
              <p className="text-neutral-505 text-[11px]">Expired certificates, overdue approvals, delayed deliveries, supplier risk, and latest scan outcomes.</p>
            </div>
          </div>
        </div>

      </div>

      {/* 4. AI INSIGHT CARD */}
      <section id="assistant-ai-insight" className="bg-neutral-50 border border-neutral-250 p-5 rounded-2xl shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b pb-2">
          <span className="text-[10px] font-mono font-bold text-neutral-500 uppercase tracking-widest flex items-center gap-1.5">
            <Cpu className="w-4 h-4 text-black animate-pulse" /> AI Compliance Auditor Summary
          </span>
          <span className="text-[9px] font-mono text-neutral-400 font-bold uppercase">Evidence-scored answers</span>
        </div>
        <p className="text-xs text-neutral-700 leading-relaxed font-sans font-light">
          The assistant now answers from live ERP-style project records. It does not assume a material or supplier flow is safe because the UI says so; it checks material status, certificate expiry, approval state, delivery delay, supplier evidence, audit history, and latest QR scan evidence before recommending the next action.
        </p>
      </section>

      {/* 5. EVIDENCE SECTION */}
      <section id="assistant-evidence" className="bg-white border border-neutral-200 rounded-2xl p-6 shadow-xs space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-[#a3a3a3] border-b pb-3 font-mono">
          Associated Evidence Sources
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">MATERIAL EVIDENCE</span>
            <span className="font-bold text-xs block text-black truncate mt-1">Batch, supplier, status</span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">From materials API</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">COMPLIANCE EVIDENCE</span>
            <span className="font-bold text-neutral-805 text-xs block mt-1">Certificates and approvals</span>
            <span className="text-[9.5px] text-neutral-450 block font-mono">Expiry and sign-off status</span>
          </div>
          <div className="bg-neutral-50 border border-neutral-150 p-4 rounded-xl space-y-1">
            <span className="text-[9px] font-mono text-neutral-400 block font-bold font-mono">SITE EVIDENCE</span>
            <span className="font-bold text-neutral-805 text-xs block mt-1">Deliveries and QR scans</span>
            <span className="text-[9.3px] text-neutral-450 block font-mono">Delay and scan outcomes</span>
          </div>
        </div>
      </section>

      {/* 6. ACTION RECOMMENDATIONS */}
      <section id="assistant-actions" className="bg-[#1c1c1c] text-white border border-neutral-900 rounded-2xl p-6 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-neutral-850 pb-3">
          <h4 className="text-[10px] font-mono font-bold uppercase text-neutral-[#a3a3a3] tracking-widest">
            RECOMMENDED COMPLIANCE INSTRUCTIONS
          </h4>
          <span className="text-[9.5px] font-mono text-amber-500 font-bold uppercase bg-amber-950/20 px-2 py-0.5 rounded tracking-wider animate-pulse">
            AUDIT REQUIRED
          </span>
        </div>
        <ul className="space-y-3.5 text-xs font-sans text-neutral-305">
          <li className="flex items-start gap-2.5">
            <span className="h-2 w-2 rounded-full bg-amber-500 mt-1.5 shrink-0" />
            <div>
              <strong className="text-white block font-semibold leading-tight">Ask for ERP operations view before project review</strong>
              <p className="text-neutral-405 mt-0.5 leading-normal font-light">Use the assistant to summarize materials, suppliers, approvals, deliveries, certificates, scans, and audit evidence in one answer.</p>
            </div>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="h-2 w-2 rounded-full bg-neutral-500 mt-1.5 shrink-0" />
            <div>
              <strong className="text-white block font-semibold leading-tight">Escalate the first ERP blocker</strong>
              <p className="text-neutral-405 mt-0.5 leading-normal font-light">The backend answer identifies whether compliance, procurement, approval, material quality, or site scan evidence should be cleared first.</p>
            </div>
          </li>
        </ul>
      </section>

    </div>
  );
}

interface Send {
  className?: string;
}
