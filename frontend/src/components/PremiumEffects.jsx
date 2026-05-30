import { useEffect, useState } from "react";

export function AnimatedNumber({ value, duration = 720, suffix = "" }) {
  const numericValue = Number(value);
  const [displayValue, setDisplayValue] = useState(Number.isFinite(numericValue) ? 0 : value);

  useEffect(() => {
    if (!Number.isFinite(numericValue)) {
      setDisplayValue(value);
      return;
    }

    const startedAt = performance.now();
    let frameId;

    function tick(now) {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.round(numericValue * eased));
      if (progress < 1) frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [duration, numericValue, value]);

  return <>{displayValue}{suffix}</>;
}

export function ReadinessGauge({ score, label }) {
  const normalized = Math.max(0, Math.min(100, Number(score) || 0));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  const tone = normalized >= 75 ? "ready" : normalized >= 40 ? "watch" : "blocked";

  return (
    <div className={`readiness-gauge ${tone}`} style={{ "--gauge-offset": offset, "--gauge-circumference": circumference }}>
      <svg viewBox="0 0 128 128" role="img" aria-label={`Readiness score ${normalized}%`}>
        <circle className="gauge-track" cx="64" cy="64" r={radius} />
        <circle className="gauge-fill" cx="64" cy="64" r={radius} />
      </svg>
      <div className="gauge-center">
        <strong><AnimatedNumber value={normalized} suffix="%" /></strong>
        <span>{label}</span>
      </div>
    </div>
  );
}

export function SeverityDot({ severity }) {
  return <span className={`severity-dot ${String(severity || "info").toLowerCase()}`} aria-hidden="true" />;
}

export function StatusStamp({ status }) {
  const normalized = String(status || "At risk");
  const tone = normalized.toLowerCase().includes("ready") ? "ready" : "risk";
  return <span className={`status-stamp ${tone}`}>{tone === "ready" ? "READY" : "AT RISK"}</span>;
}
