import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ClipboardCheck,
  FileWarning,
  MessageSquareText,
  SendHorizonal,
  ShieldCheck,
  Sparkles,
  Truck,
  Zap
} from "lucide-react";
import { api } from "../api/client.js";
import ChatBubble from "../components/ChatBubble.jsx";
import SkeletonCards from "../components/SkeletonCards.jsx";

function getWelcomeMessage(projectName) {
  return {
    role: "assistant",
    content: `Welcome to ${projectName} intelligence.\nI have access to materials, approvals, compliance certificates, delivery records, and QR scans for this project.\nAsk me anything — or pick a question from the left panel to get started.`,
    dataUsed: ["projects", "materials", "approvals", "compliance_certificates", "deliveries", "qr_scans"],
    reasoningSources: [`${projectName} project data`, "Material and compliance records", "Delivery and approval status"],
    confidence: "High — connected to live project database"
  };
}

export default function Chat({ projectId, selectedProject }) {
  const projectName = selectedProject?.name || "selected project";

  const questionCategories = useMemo(
    () => [
      {
        label: "Materials",
        icon: ShieldCheck,
        questions: [
          `Which materials on ${projectName} are not yet verified?`,
          "Can any materials be released for site use today?"
        ]
      },
      {
        label: "Approvals",
        icon: ClipboardCheck,
        questions: [
          "Which approvals are overdue and what is the risk?",
          "Which approvals are blocking execution right now?"
        ]
      },
      {
        label: "Compliance",
        icon: FileWarning,
        questions: [
          "Which compliance certificates are expired or expiring?",
          "What certificates need renewal this month?"
        ]
      },
      {
        label: "Operations",
        icon: Truck,
        questions: [
          "What should the project manager fix first today?",
          "Which deliveries are delayed and what work is affected?"
        ]
      },
      {
        label: "Intelligence",
        icon: Zap,
        questions: [
          `Generate an executive brief for ${projectName}.`,
          "Generate manager daily brief for today",
          "Summarize recent QR scan issues."
        ]
      }
    ],
    [projectName]
  );

  const [messages, setMessages] = useState([getWelcomeMessage(projectName)]);
  const [evidence, setEvidence] = useState(null);
  const [evidenceError, setEvidenceError] = useState("");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState(null);
  const inputRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    setMessages([getWelcomeMessage(projectName)]);
    setEvidence(null);
    setEvidenceError("");
    setQuestion("");
    setActiveCategory(null);
    api.evidence(projectId).then(setEvidence).catch((err) => setEvidenceError(err.message));
    const quickQuestion = sessionStorage.getItem("constructask-quick-question");
    if (quickQuestion) {
      sessionStorage.removeItem("constructask-quick-question");
      window.setTimeout(() => ask(quickQuestion), 0);
    }
  }, [projectId]);

  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function ask(nextQuestion) {
    const finalQuestion = nextQuestion.trim();
    if (!finalQuestion || loading) return;

    setQuestion("");
    setLoading(true);
    setMessages((current) => [...current, { role: "user", content: finalQuestion }]);

    try {
      const response = await api.chat(finalQuestion, projectId);
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: response.answer,
          dataUsed: response.data_used,
          mode: response.mode,
          reasoningSources: response.reasoning_sources,
          confidence: response.confidence
        }
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        {
          role: "assistant",
          content: `I could not reach the ConstructAsk API. Start the backend on port 8000, then try again.\n\nDetails: ${error.message}`,
          dataUsed: [],
          reasoningSources: [],
          confidence: ""
        }
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }

  const openItems = evidence?.summary?.open_items;
  const topPriority = evidence?.summary?.top_priority;

  return (
    <section className="chat-layout evidence-assistant-layout">
      <aside className="suggestion-panel">
        <div className="chat-sidebar-brand">
          <Bot size={22} />
          <div>
            <strong>ConstructAsk AI</strong>
            <small>Evidence-based project intelligence</small>
          </div>
        </div>

        {evidence ? (
          <div className="assistant-evidence-summary">
            <div>
              <span>Open evidence items</span>
              <strong>{openItems}</strong>
            </div>
            <p>{evidence.summary.recommendation}</p>
          </div>
        ) : evidenceError ? (
          <div className="empty-state compact">{evidenceError}</div>
        ) : (
          <SkeletonCards type="panel" count={1} />
        )}

        {evidence ? (
          <div className="assistant-evidence-grid">
            {[
              ["Certs", evidence.certificates.length, FileWarning, "Which certificates need attention today?"],
              ["Deliveries", evidence.deliveries.length, Truck, "Which deliveries are delayed and what work is affected?"],
              ["Approvals", evidence.approvals.length, ClipboardCheck, "Which approvals are blocking execution?"]
            ].map(([label, count, Icon, prompt]) => (
              <button className="assistant-evidence-card" type="button" key={label} onClick={() => ask(prompt)}>
                <Icon size={17} />
                <span>{label}</span>
                <strong>{count}</strong>
              </button>
            ))}
          </div>
        ) : null}

        <div className="chat-category-nav">
          {questionCategories.map((category) => {
            const Icon = category.icon;
            const isActive = activeCategory === category.label;
            return (
              <div key={category.label}>
                <button
                  className={`chat-category-button ${isActive ? "active" : ""}`}
                  type="button"
                  onClick={() => setActiveCategory(isActive ? null : category.label)}
                >
                  <Icon size={16} />
                  <span>{category.label}</span>
                  <span className="chat-category-count">{category.questions.length}</span>
                  <ArrowRight size={14} className="chat-category-arrow" />
                </button>
                {isActive ? (
                  <div className="chat-category-questions">
                    {category.questions.map((q) => (
                      <button key={q} type="button" onClick={() => ask(q)}>
                        <Sparkles size={14} />
                        <span>{q}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </aside>

      <article className="chat-panel">
        <div className="assistant-header">
          <div>
            <p className="eyebrow">Ask with evidence</p>
            <h2>{projectName}</h2>
          </div>
          <span>
            <AlertTriangle size={15} />
            {topPriority || "Evidence"} priority
          </span>
        </div>

        <div className="chat-stream" ref={streamRef}>
          {messages.map((message, index) => (
            <ChatBubble message={message} key={`${message.role}-${index}`} />
          ))}
          {loading ? (
            <div className="typing">
              <Bot size={16} />
              <span>ConstructAsk is reading project data</span>
              <i /><i /><i />
            </div>
          ) : null}
        </div>

        <form
          className="chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            ask(question);
          }}
        >
          <div className="chat-input-wrapper">
            <MessageSquareText size={18} className="chat-input-icon" />
            <input
              ref={inputRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask about materials, approvals, compliance, deliveries..."
            />
          </div>
          <button className="primary-button icon-button" type="submit" disabled={loading}>
            <SendHorizonal size={18} />
            Send
          </button>
        </form>
      </article>
    </section>
  );
}
