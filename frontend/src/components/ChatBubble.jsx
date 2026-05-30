import { motion } from "framer-motion";
import { Bot, Database, Gauge, ShieldCheck, User } from "lucide-react";

export default function ChatBubble({ message }) {
  const isUser = message.role === "user";
  const dataUsed = message.dataUsed?.map((item) => item.replaceAll("_", " ")) || [];

  return (
    <motion.article
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={`chat-bubble ${isUser ? "user" : "assistant"}`}
    >
      <div className="bubble-header">
        <span className="bubble-avatar">
          {isUser ? <User size={14} /> : <Bot size={14} />}
        </span>
        <strong>{isUser ? "You" : "ConstructAsk"}</strong>
        {!isUser && message.mode ? (
          <span className="bubble-mode">{message.mode === "deterministic-demo" ? "Evidence mode" : "AI mode"}</span>
        ) : null}
      </div>
      <div className="bubble-body">
        {message.content.split("\n").map((line, index) => (
          <p key={`${index}-${line.slice(0, 20)}`}>{line}</p>
        ))}
      </div>

      {!isUser && message.dataUsed?.length > 0 ? (
        <div className="why-panel">
          <div className="why-title">
            <ShieldCheck size={16} />
            <strong>Evidence behind this answer</strong>
          </div>

          {message.reasoningSources?.length > 0 ? (
            <div className="reason-chip-list">
              {message.reasoningSources.map((source) => (
                <span className="reason-chip" key={source}>
                  {source}
                </span>
              ))}
            </div>
          ) : null}

          <div className="evidence-meta-row">
            <span>
              <Database size={14} />
              {dataUsed.join(", ")}
            </span>
            {message.confidence ? (
              <span className="confidence-tag">
                <Gauge size={14} />
                {message.confidence}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </motion.article>
  );
}
