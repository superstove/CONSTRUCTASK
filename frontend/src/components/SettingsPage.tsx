import React, { useState, useCallback } from "react";
import {
  User,
  Users,
  Key,
  Palette,
  Bell,
  Shield,
  Mail,
  Phone,
  Building,
  Briefcase,
  Edit3,
  Save,
  Plus,
  X,
  Copy,
  Eye,
  EyeOff,
  Trash2,
  Globe,
  Link2,
  Upload,
  Check,
  AlertCircle,
  ChevronRight,
  Lock,
  Crown,
  UserCheck,
  Settings,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────── */

type TabId = "profile" | "users" | "api" | "branding" | "notifications";

interface TabDef {
  id: TabId;
  label: string;
  icon: React.ElementType;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "Active" | "Invited" | "Disabled";
  avatar?: string;
}

interface ApiKeyEntry {
  id: string;
  name: string;
  key: string;
  created: string;
  lastUsed: string;
  status: "Active" | "Revoked";
}

interface WebhookEntry {
  id: string;
  url: string;
  events: string[];
  status: "Active" | "Inactive";
  created: string;
}

interface NotifPref {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
}

/* ─── Constants ─────────────────────────────────────────────────────── */

const TABS: TabDef[] = [
  { id: "profile", label: "My Profile", icon: User },
  { id: "users", label: "Users & Roles", icon: Users },
  { id: "api", label: "API & Webhooks", icon: Key },
  { id: "branding", label: "Branding", icon: Palette },
  { id: "notifications", label: "Notifications", icon: Bell },
];

const INITIAL_MEMBERS: TeamMember[] = [
  { id: "u1", name: "Anton Demo", email: "demo@constructask.dev", role: "Admin", status: "Active" },
  { id: "u2", name: "Abhijith AK", email: "abhijith@antonsolutions.in", role: "Developer", status: "Active" },
  { id: "u3", name: "Project Manager", email: "pm@antonsolutions.in", role: "Manager", status: "Active" },
];

const INITIAL_API_KEYS: ApiKeyEntry[] = [
  {
    id: "ak1",
    name: "Production Key",
    key: "cask_live_7f3a...x9d2",
    created: "2026-01-15",
    lastUsed: "2026-06-14",
    status: "Active",
  },
];

const INITIAL_WEBHOOKS: WebhookEntry[] = [
  {
    id: "wh1",
    url: "https://hooks.antonsolutions.in/constructask",
    events: ["material.verified", "certificate.expiring"],
    status: "Active",
    created: "2026-02-20",
  },
];

const INITIAL_NOTIFS: NotifPref[] = [
  { id: "n1", label: "Material verification failures", description: "Get alerted when a material fails QR or document verification", enabled: true },
  { id: "n2", label: "Certificate expiry alerts (30 days)", description: "Receive reminders before compliance certificates expire", enabled: true },
  { id: "n3", label: "New approval requests", description: "Notify when new materials or documents require your sign-off", enabled: false },
  { id: "n4", label: "Compliance deadline reminders", description: "Upcoming regulatory and project compliance deadlines", enabled: true },
  { id: "n5", label: "API error notifications", description: "Immediate alerts for API failures and rate-limit breaches", enabled: true },
  { id: "n6", label: "Weekly digest reports", description: "A summary of platform activity delivered every Monday", enabled: false },
];

const ROLE_CARDS = [
  {
    role: "Admin",
    icon: Crown,
    color: "from-amber-500/20 to-orange-500/20",
    border: "border-amber-500/30",
    text: "text-amber-400",
    permissions: ["Full system access", "User management", "API key creation", "Billing & branding", "Audit log export"],
  },
  {
    role: "Manager",
    icon: UserCheck,
    color: "from-cyan-500/20 to-blue-500/20",
    border: "border-cyan-500/30",
    text: "text-cyan-400",
    permissions: ["Project management", "Approval workflows", "Certificate uploads", "Team view access", "Report generation"],
  },
  {
    role: "Viewer",
    icon: Eye,
    color: "from-emerald-500/20 to-teal-500/20",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    permissions: ["Read-only dashboard", "View certificates", "View audit trail", "Download reports"],
  },
];

/* ─── Reusable sub-components ───────────────────────────────────────── */

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!enabled)}
      className="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none"
      style={{ backgroundColor: enabled ? "var(--theme-accent)" : "var(--theme-border)" }}
      aria-pressed={enabled}
    >
      <span
        className="pointer-events-none inline-block h-5 w-5 rounded-full shadow-lg transform transition duration-200 ease-in-out"
        style={{
          backgroundColor: enabled ? "var(--theme-accent-text)" : "var(--theme-text-secondary)",
          transform: enabled ? "translateX(20px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

function SectionCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`premium-card rounded-2xl border premium-border p-6 md:p-8 ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle, action }: { icon: React.ElementType; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h3 className="text-base font-bold premium-text-primary">{title}</h3>
          {subtitle && <p className="text-xs premium-text-secondary mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

function FormInput({
  label,
  value,
  onChange,
  readOnly = false,
  note,
  type = "text",
  placeholder,
  icon: Icon,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  readOnly?: boolean;
  note?: string;
  type?: string;
  placeholder?: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wider premium-text-secondary block">
        {label}
      </label>
      <div className="relative">
        {Icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
            <Icon className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
          </div>
        )}
        <input
          type={type}
          value={value}
          readOnly={readOnly}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-xl border px-4 py-2.5 text-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 ${
            Icon ? "pl-10" : ""
          } ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
          style={{
            backgroundColor: "var(--theme-bg-sub)",
            borderColor: "var(--theme-border)",
            color: "var(--theme-text-primary)",
          }}
        />
      </div>
      {note && (
        <p className="text-[10px] flex items-center gap-1 mt-1" style={{ color: "var(--theme-text-secondary)" }}>
          <AlertCircle className="w-3 h-3" />
          {note}
        </p>
      )}
    </div>
  );
}

function AccentButton({ children, onClick, variant = "primary", size = "md", className = "" }: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  className?: string;
}) {
  const base = "inline-flex items-center gap-2 font-semibold rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 cursor-pointer";
  const sizeClass = size === "sm" ? "px-3 py-1.5 text-xs" : "px-5 py-2.5 text-sm";

  const variantStyles: Record<string, React.CSSProperties> = {
    primary: { backgroundColor: "var(--theme-accent)", color: "var(--theme-accent-text)" },
    secondary: { backgroundColor: "var(--theme-bg-sub)", color: "var(--theme-text-primary)", border: "1px solid var(--theme-border)" },
    danger: { backgroundColor: "rgba(239, 68, 68, 0.15)", color: "#EF4444", border: "1px solid rgba(239, 68, 68, 0.3)" },
  };

  return (
    <button onClick={onClick} className={`${base} ${sizeClass} ${className}`} style={variantStyles[variant]}>
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isActive = status === "Active";
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border"
      style={{
        backgroundColor: isActive ? "var(--badge-success-bg)" : "var(--badge-warning-bg)",
        color: isActive ? "var(--badge-success-text)" : "var(--badge-warning-text)",
        borderColor: isActive ? "var(--badge-success-border)" : "var(--badge-warning-border)",
      }}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"}`} />
      {status}
    </span>
  );
}

/* ─── Tab Content Components ────────────────────────────────────────── */

function ProfileTab() {
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState({
    firstName: "Anton",
    lastName: "Demo",
    email: "demo@constructask.dev",
    jobTitle: "Platform Administrator",
    department: "Engineering",
    phone: "+91 98765 43210",
  });

  const updateField = (field: string, value: string) => {
    setProfile((p) => ({ ...p, [field]: value }));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Profile Card */}
      <SectionCard>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-8">
          <div className="flex items-center gap-5">
            {/* Avatar */}
            <div
              className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 border-2"
              style={{
                background: "linear-gradient(135deg, rgba(20,184,166,0.2), rgba(59,130,246,0.2))",
                borderColor: "var(--theme-accent)",
              }}
            >
              <User className="w-9 h-9" style={{ color: "var(--theme-accent)" }} />
            </div>
            <div>
              <h2 className="text-xl font-extrabold premium-text-primary">
                {profile.firstName} {profile.lastName}
              </h2>
              <p className="text-sm premium-text-secondary mt-0.5">{profile.jobTitle}</p>
              <p className="text-xs premium-text-secondary mt-0.5">{profile.department} · Anton Solutions</p>
            </div>
          </div>
          <AccentButton
            onClick={() => setEditing(!editing)}
            variant={editing ? "primary" : "secondary"}
          >
            {editing ? <><Save className="w-4 h-4" /> Save Changes</> : <><Edit3 className="w-4 h-4" /> Edit Profile</>}
          </AccentButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <FormInput
            label="First Name"
            value={profile.firstName}
            onChange={(v) => updateField("firstName", v)}
            readOnly={!editing}
            icon={User}
          />
          <FormInput
            label="Last Name"
            value={profile.lastName}
            onChange={(v) => updateField("lastName", v)}
            readOnly={!editing}
            icon={User}
          />
          <FormInput
            label="Email Address"
            value={profile.email}
            readOnly
            note="Email cannot be changed directly. Contact your administrator."
            icon={Mail}
          />
          <FormInput
            label="Phone Number"
            value={profile.phone}
            onChange={(v) => updateField("phone", v)}
            readOnly={!editing}
            icon={Phone}
          />
          <FormInput
            label="Job Title"
            value={profile.jobTitle}
            onChange={(v) => updateField("jobTitle", v)}
            readOnly={!editing}
            icon={Briefcase}
          />
          <FormInput
            label="Department"
            value={profile.department}
            onChange={(v) => updateField("department", v)}
            readOnly={!editing}
            icon={Building}
          />
        </div>
      </SectionCard>

      {/* Account Information */}
      <SectionCard>
        <SectionHeader icon={Building} title="Account Information" subtitle="Your organization and account details" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Company", value: "Anton Solutions" },
            { label: "Company ID", value: "ANT-2026" },
            { label: "Role", value: "Admin" },
            { label: "Account Type", value: "Enterprise" },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-xl p-4 border"
              style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-border)" }}
            >
              <span className="text-[9px] font-mono uppercase tracking-widest block mb-1" style={{ color: "var(--theme-text-secondary)" }}>
                {item.label}
              </span>
              <span className="text-sm font-bold block" style={{ color: "var(--theme-text-primary)" }}>
                {item.value}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Password & Security */}
      <SectionCard>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
              <Lock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-base font-bold premium-text-primary">Password & Security</h3>
              <p className="text-xs premium-text-secondary mt-0.5">
                Manage your password, two-factor authentication, and active sessions
              </p>
            </div>
          </div>
          <AccentButton variant="secondary">
            <Shield className="w-4 h-4" /> Open Security Settings <ChevronRight className="w-4 h-4" />
          </AccentButton>
        </div>
      </SectionCard>
    </div>
  );
}

function UsersTab() {
  const [members, setMembers] = useState<TeamMember[]>(INITIAL_MEMBERS);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState({ name: "", email: "", role: "Viewer" });

  const handleInvite = () => {
    if (!invite.name || !invite.email) return;
    const newMember: TeamMember = {
      id: `u${Date.now()}`,
      name: invite.name,
      email: invite.email,
      role: invite.role,
      status: "Invited",
    };
    setMembers((prev) => [...prev, newMember]);
    setInvite({ name: "", email: "", role: "Viewer" });
    setShowInvite(false);
  };

  const removeMember = (id: string) => {
    setMembers((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Team Members */}
      <SectionCard>
        <SectionHeader
          icon={Users}
          title="Team Members"
          subtitle={`${members.length} members in your organization`}
          action={
            <AccentButton onClick={() => setShowInvite(true)}>
              <Plus className="w-4 h-4" /> Invite User
            </AccentButton>
          }
        />

        {/* Invite modal */}
        {showInvite && (
          <div
            className="rounded-xl border p-5 mb-6"
            style={{
              backgroundColor: "var(--theme-bg-sub)",
              borderColor: "var(--theme-accent)",
              boxShadow: "0 0 0 1px var(--theme-accent), 0 4px 20px rgba(20,184,166,0.1)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold premium-text-primary">Invite New Team Member</h4>
              <button onClick={() => setShowInvite(false)} className="p-1 rounded-lg hover:opacity-70 transition-opacity cursor-pointer">
                <X className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <FormInput label="Full Name" value={invite.name} onChange={(v) => setInvite((p) => ({ ...p, name: v }))} placeholder="Jane Smith" icon={User} />
              <FormInput label="Email Address" value={invite.email} onChange={(v) => setInvite((p) => ({ ...p, email: v }))} placeholder="jane@company.com" icon={Mail} type="email" />
              <div className="space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider block" style={{ color: "var(--theme-text-secondary)" }}>
                  Role
                </label>
                <select
                  value={invite.role}
                  onChange={(e) => setInvite((p) => ({ ...p, role: e.target.value }))}
                  className="w-full rounded-xl border px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[var(--theme-accent)]/40 cursor-pointer"
                  style={{
                    backgroundColor: "var(--theme-bg-sub)",
                    borderColor: "var(--theme-border)",
                    color: "var(--theme-text-primary)",
                  }}
                >
                  <option value="Admin">Admin</option>
                  <option value="Manager">Manager</option>
                  <option value="Developer">Developer</option>
                  <option value="Viewer">Viewer</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end mt-4 gap-3">
              <AccentButton variant="secondary" onClick={() => setShowInvite(false)} size="sm">Cancel</AccentButton>
              <AccentButton onClick={handleInvite} size="sm"><Plus className="w-3.5 h-3.5" /> Send Invite</AccentButton>
            </div>
          </div>
        )}

        {/* Members Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr
                className="text-[10px] font-mono uppercase tracking-widest border-b"
                style={{ color: "var(--theme-text-secondary)", borderColor: "var(--theme-border)" }}
              >
                <th className="text-left py-3 px-4 font-semibold">Member</th>
                <th className="text-left py-3 px-4 font-semibold hidden md:table-cell">Email</th>
                <th className="text-left py-3 px-4 font-semibold">Role</th>
                <th className="text-left py-3 px-4 font-semibold">Status</th>
                <th className="text-right py-3 px-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr
                  key={m.id}
                  className="border-b transition-colors duration-150 hover:opacity-90"
                  style={{ borderColor: "var(--theme-border)" }}
                >
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0"
                        style={{
                          background: "linear-gradient(135deg, rgba(20,184,166,0.2), rgba(59,130,246,0.2))",
                          color: "var(--theme-accent)",
                        }}
                      >
                        {m.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                      </div>
                      <span className="font-semibold premium-text-primary">{m.name}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 hidden md:table-cell">
                    <span className="font-mono text-xs" style={{ color: "var(--theme-text-secondary)" }}>{m.email}</span>
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border"
                      style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-border)", color: "var(--theme-text-primary)" }}
                    >
                      {m.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-4"><StatusBadge status={m.status} /></td>
                  <td className="py-3.5 px-4 text-right">
                    <button
                      onClick={() => removeMember(m.id)}
                      className="p-1.5 rounded-lg transition-colors duration-150 hover:opacity-70 cursor-pointer"
                      title="Remove member"
                    >
                      <Trash2 className="w-4 h-4" style={{ color: "#EF4444" }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Role Permissions */}
      <SectionCard>
        <SectionHeader icon={Shield} title="Role Permissions" subtitle="Access levels defined for your organization" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {ROLE_CARDS.map((r) => (
            <div
              key={r.role}
              className={`rounded-xl border p-5 bg-gradient-to-br ${r.color} ${r.border} relative overflow-hidden`}
            >
              <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-white/5 to-transparent rounded-bl-full" />
              <div className="flex items-center gap-3 mb-4">
                <r.icon className={`w-5 h-5 ${r.text}`} />
                <h4 className="text-sm font-extrabold premium-text-primary">{r.role}</h4>
              </div>
              <ul className="space-y-2">
                {r.permissions.map((p) => (
                  <li key={p} className="flex items-center gap-2 text-xs" style={{ color: "var(--theme-text-secondary)" }}>
                    <Check className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--theme-accent)" }} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function ApiTab() {
  const [keys, setKeys] = useState<ApiKeyEntry[]>(INITIAL_API_KEYS);
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>(INITIAL_WEBHOOKS);
  const [ipAllowlist, setIpAllowlist] = useState<string[]>([]);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [showNewWebhook, setShowNewWebhook] = useState(false);
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [showNewIp, setShowNewIp] = useState(false);
  const [newIp, setNewIp] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const toggleReveal = (id: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCopy = useCallback((id: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  const createKey = () => {
    if (!newKeyName) return;
    const newEntry: ApiKeyEntry = {
      id: `ak${Date.now()}`,
      name: newKeyName,
      key: `cask_live_${Math.random().toString(36).slice(2, 6)}...${Math.random().toString(36).slice(2, 6)}`,
      created: new Date().toISOString().split("T")[0],
      lastUsed: "Never",
      status: "Active",
    };
    setKeys((prev) => [...prev, newEntry]);
    setNewKeyName("");
    setShowNewKey(false);
  };

  const addWebhook = () => {
    if (!newWebhookUrl) return;
    const newWh: WebhookEntry = {
      id: `wh${Date.now()}`,
      url: newWebhookUrl,
      events: ["material.verified"],
      status: "Active",
      created: new Date().toISOString().split("T")[0],
    };
    setWebhooks((prev) => [...prev, newWh]);
    setNewWebhookUrl("");
    setShowNewWebhook(false);
  };

  const addIp = () => {
    if (!newIp) return;
    setIpAllowlist((prev) => [...prev, newIp]);
    setNewIp("");
    setShowNewIp(false);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* API Keys */}
      <SectionCard>
        <SectionHeader
          icon={Key}
          title="API Keys"
          subtitle="Manage keys for programmatic access to the ConstructAsk API"
          action={
            <AccentButton onClick={() => setShowNewKey(true)}>
              <Plus className="w-4 h-4" /> Create API Key
            </AccentButton>
          }
        />

        {showNewKey && (
          <div
            className="rounded-xl border p-5 mb-6"
            style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-accent)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold premium-text-primary">New API Key</h4>
              <button onClick={() => setShowNewKey(false)} className="p-1 rounded-lg hover:opacity-70 cursor-pointer">
                <X className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
              </button>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <FormInput label="Key Name" value={newKeyName} onChange={setNewKeyName} placeholder="e.g. Production, Staging" icon={Key} />
              </div>
              <AccentButton onClick={createKey} className="mb-0.5"><Plus className="w-3.5 h-3.5" /> Generate</AccentButton>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {keys.map((k) => (
            <div
              key={k.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border"
              style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-border)" }}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, rgba(20,184,166,0.15), rgba(59,130,246,0.15))" }}
                >
                  <Key className="w-4 h-4" style={{ color: "var(--theme-accent)" }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold premium-text-primary">{k.name}</span>
                    <StatusBadge status={k.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <code
                      className="text-xs font-mono px-2 py-0.5 rounded-md border"
                      style={{ backgroundColor: "var(--theme-bg-app)", borderColor: "var(--theme-border)", color: "var(--theme-text-secondary)" }}
                    >
                      {revealedKeys.has(k.id) ? k.key.replace("...", "a8c3f2b1e9") : k.key}
                    </code>
                    <button onClick={() => toggleReveal(k.id)} className="p-1 hover:opacity-70 cursor-pointer" title="Toggle visibility">
                      {revealedKeys.has(k.id) ? (
                        <EyeOff className="w-3.5 h-3.5" style={{ color: "var(--theme-text-secondary)" }} />
                      ) : (
                        <Eye className="w-3.5 h-3.5" style={{ color: "var(--theme-text-secondary)" }} />
                      )}
                    </button>
                    <button onClick={() => handleCopy(k.id, k.key)} className="p-1 hover:opacity-70 cursor-pointer" title="Copy key">
                      {copiedId === k.id ? (
                        <Check className="w-3.5 h-3.5" style={{ color: "var(--theme-accent)" }} />
                      ) : (
                        <Copy className="w-3.5 h-3.5" style={{ color: "var(--theme-text-secondary)" }} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4 text-[11px] shrink-0" style={{ color: "var(--theme-text-secondary)" }}>
                <span>Created {k.created}</span>
                <span className="hidden sm:inline">·</span>
                <span className="hidden sm:inline">Last used {k.lastUsed}</span>
                <button className="p-1.5 rounded-lg hover:opacity-70 cursor-pointer" title="Revoke key">
                  <Trash2 className="w-4 h-4" style={{ color: "#EF4444" }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Webhooks */}
      <SectionCard>
        <SectionHeader
          icon={Link2}
          title="Webhooks"
          subtitle="Configure event endpoints for real-time updates"
          action={
            <AccentButton onClick={() => setShowNewWebhook(true)}>
              <Plus className="w-4 h-4" /> Add Webhook Endpoint
            </AccentButton>
          }
        />

        {showNewWebhook && (
          <div
            className="rounded-xl border p-5 mb-6"
            style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-accent)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-sm font-bold premium-text-primary">New Webhook Endpoint</h4>
              <button onClick={() => setShowNewWebhook(false)} className="p-1 rounded-lg hover:opacity-70 cursor-pointer">
                <X className="w-4 h-4" style={{ color: "var(--theme-text-secondary)" }} />
              </button>
            </div>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <FormInput label="Endpoint URL" value={newWebhookUrl} onChange={setNewWebhookUrl} placeholder="https://api.example.com/webhooks" icon={Globe} />
              </div>
              <AccentButton onClick={addWebhook} className="mb-0.5"><Plus className="w-3.5 h-3.5" /> Add</AccentButton>
            </div>
          </div>
        )}

        <div className="space-y-3">
          {webhooks.map((wh) => (
            <div
              key={wh.id}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border"
              style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-border)" }}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.15), rgba(168,85,247,0.15))" }}
                >
                  <Link2 className="w-4 h-4 text-violet-400" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code className="text-xs font-mono premium-text-primary truncate max-w-[280px]">{wh.url}</code>
                    <StatusBadge status={wh.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    {wh.events.map((e) => (
                      <span
                        key={e}
                        className="text-[10px] font-mono px-2 py-0.5 rounded-md border"
                        style={{ backgroundColor: "var(--theme-bg-app)", borderColor: "var(--theme-border)", color: "var(--theme-text-secondary)" }}
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[11px] shrink-0" style={{ color: "var(--theme-text-secondary)" }}>
                <span>Added {wh.created}</span>
                <button className="p-1.5 rounded-lg hover:opacity-70 cursor-pointer">
                  <Trash2 className="w-4 h-4" style={{ color: "#EF4444" }} />
                </button>
              </div>
            </div>
          ))}
          {webhooks.length === 0 && (
            <div className="text-center py-12 rounded-xl border border-dashed" style={{ borderColor: "var(--theme-border)" }}>
              <Link2 className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--theme-text-secondary)" }} />
              <p className="text-sm premium-text-secondary">No webhook endpoints configured</p>
              <p className="text-xs premium-text-secondary mt-1">Add an endpoint to receive real-time event notifications</p>
            </div>
          )}
        </div>
      </SectionCard>

      {/* IP Allowlist */}
      <SectionCard>
        <SectionHeader
          icon={Shield}
          title="IP Allowlist"
          subtitle="Restrict API access to specific IP addresses"
          action={
            <AccentButton onClick={() => setShowNewIp(true)} variant="secondary">
              <Plus className="w-4 h-4" /> Add IP Address
            </AccentButton>
          }
        />

        {showNewIp && (
          <div
            className="rounded-xl border p-5 mb-6"
            style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-accent)" }}
          >
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <FormInput label="IP Address" value={newIp} onChange={setNewIp} placeholder="203.0.113.0/24" icon={Globe} />
              </div>
              <AccentButton onClick={addIp} className="mb-0.5"><Plus className="w-3.5 h-3.5" /> Add</AccentButton>
            </div>
          </div>
        )}

        {ipAllowlist.length > 0 ? (
          <div className="space-y-2">
            {ipAllowlist.map((ip, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-3 rounded-xl border"
                style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-border)" }}
              >
                <code className="text-sm font-mono premium-text-primary">{ip}</code>
                <button onClick={() => setIpAllowlist((prev) => prev.filter((_, j) => j !== i))} className="p-1.5 rounded-lg hover:opacity-70 cursor-pointer">
                  <Trash2 className="w-4 h-4" style={{ color: "#EF4444" }} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 rounded-xl border border-dashed" style={{ borderColor: "var(--theme-border)" }}>
            <Globe className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--theme-text-secondary)" }} />
            <p className="text-sm premium-text-secondary">No IP restrictions configured</p>
            <p className="text-xs premium-text-secondary mt-1">All IP addresses are currently allowed</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function BrandingTab() {
  const [brandColor, setBrandColor] = useState("#0B0F17");
  const [footerText, setFooterText] = useState("ConstructAsk · Anton Solutions · Verified Material Passport");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Company Logo */}
      <SectionCard>
        <SectionHeader icon={Upload} title="Company Logo" subtitle="Displayed on reports, labels, and the platform header" />
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div
            className="w-40 h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-3 shrink-0"
            style={{ borderColor: "var(--theme-border)", backgroundColor: "var(--theme-bg-sub)" }}
          >
            <div
              className="w-16 h-16 rounded-xl flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, rgba(20,184,166,0.2), rgba(59,130,246,0.2))" }}
            >
              <Building className="w-8 h-8" style={{ color: "var(--theme-accent)" }} />
            </div>
            <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: "var(--theme-text-secondary)" }}>
              Your Logo
            </span>
          </div>
          <div className="space-y-4 flex-1">
            <div>
              <AccentButton variant="secondary">
                <Upload className="w-4 h-4" /> Change Logo
              </AccentButton>
            </div>
            <div className="space-y-1">
              <p className="text-xs premium-text-secondary flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                Supported formats: PNG, SVG, JPG (Max 2MB)
              </p>
              <p className="text-xs premium-text-secondary">
                Recommended dimensions: 400×400px or larger for best quality
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Brand Color */}
      <SectionCard>
        <SectionHeader icon={Palette} title="Brand Color" subtitle="Primary accent color used throughout the platform" />
        <div className="flex flex-col sm:flex-row items-start gap-6">
          <div className="flex items-center gap-4">
            <div className="relative">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-16 h-16 rounded-xl border-2 cursor-pointer appearance-none bg-transparent p-0"
                style={{ borderColor: "var(--theme-border)" }}
              />
            </div>
            <div className="space-y-2">
              <FormInput
                label="Hex Value"
                value={brandColor}
                onChange={setBrandColor}
                placeholder="#000000"
              />
            </div>
          </div>
          <div className="flex-1 w-full">
            <label className="text-[11px] font-semibold uppercase tracking-wider block mb-2" style={{ color: "var(--theme-text-secondary)" }}>
              Preview
            </label>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl" style={{ backgroundColor: brandColor }} />
              <div className="h-8 flex-1 rounded-lg" style={{ backgroundColor: brandColor, opacity: 0.6 }} />
              <div className="h-8 w-24 rounded-lg" style={{ backgroundColor: brandColor, opacity: 0.3 }} />
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Footer Text */}
      <SectionCard>
        <SectionHeader icon={Settings} title="Label Footer Text" subtitle="Appears on generated labels, PDFs, and material passports" />
        <FormInput
          label="Footer Text"
          value={footerText}
          onChange={setFooterText}
          placeholder="Enter text displayed on labels and PDFs"
        />
        <div
          className="mt-4 p-4 rounded-xl border text-center"
          style={{ backgroundColor: "var(--theme-bg-sub)", borderColor: "var(--theme-border)" }}
        >
          <span className="text-[9px] font-mono uppercase tracking-widest block mb-2" style={{ color: "var(--theme-text-secondary)" }}>
            Label Preview
          </span>
          <p className="text-xs font-medium" style={{ color: "var(--theme-text-primary)" }}>
            {footerText || "—"}
          </p>
        </div>
      </SectionCard>

      {/* Save */}
      <div className="flex justify-end">
        <AccentButton onClick={handleSave}>
          {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Changes</>}
        </AccentButton>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const [prefs, setPrefs] = useState<NotifPref[]>(INITIAL_NOTIFS);
  const [saved, setSaved] = useState(false);

  const togglePref = (id: string) => {
    setPrefs((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !p.enabled } : p)));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const enabledCount = prefs.filter((p) => p.enabled).length;

  return (
    <div className="space-y-6 animate-fadeIn">
      <SectionCard>
        <SectionHeader
          icon={Bell}
          title="Notification Preferences"
          subtitle={`${enabledCount} of ${prefs.length} notifications enabled`}
          action={
            <AccentButton onClick={handleSave}>
              {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Preferences</>}
            </AccentButton>
          }
        />

        <div className="space-y-1">
          {prefs.map((pref, i) => (
            <div
              key={pref.id}
              className={`flex items-center justify-between gap-4 p-4 rounded-xl transition-all duration-200 ${
                i < prefs.length - 1 ? "" : ""
              }`}
              style={{
                backgroundColor: pref.enabled ? "var(--theme-bg-sub)" : "transparent",
              }}
            >
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border"
                  style={{
                    backgroundColor: pref.enabled ? "rgba(20,184,166,0.1)" : "var(--theme-bg-sub)",
                    borderColor: pref.enabled ? "rgba(20,184,166,0.3)" : "var(--theme-border)",
                  }}
                >
                  <Bell
                    className="w-4 h-4"
                    style={{ color: pref.enabled ? "var(--theme-accent)" : "var(--theme-text-secondary)" }}
                  />
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold block" style={{ color: "var(--theme-text-primary)" }}>
                    {pref.label}
                  </span>
                  <span className="text-xs block mt-0.5" style={{ color: "var(--theme-text-secondary)" }}>
                    {pref.description}
                  </span>
                </div>
              </div>
              <Toggle enabled={pref.enabled} onChange={() => togglePref(pref.id)} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Summary Card */}
      <SectionCard>
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(20,184,166,0.15), rgba(59,130,246,0.15))" }}
          >
            <Mail className="w-5 h-5" style={{ color: "var(--theme-accent)" }} />
          </div>
          <div>
            <h4 className="text-sm font-bold premium-text-primary">Delivery Channel</h4>
            <p className="text-xs premium-text-secondary mt-0.5">
              All notifications are delivered to <span className="font-mono font-semibold" style={{ color: "var(--theme-accent)" }}>demo@constructask.dev</span> and appear in-app.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────── */

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return <ProfileTab />;
      case "users":
        return <UsersTab />;
      case "api":
        return <ApiTab />;
      case "branding":
        return <BrandingTab />;
      case "notifications":
        return <NotificationsTab />;
      default:
        return null;
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-10 w-full min-h-full pb-32 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <span className="text-[10px] font-mono uppercase tracking-widest bg-cyan-400/10 border border-cyan-400/20 px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 mb-3" style={{ color: "var(--theme-accent)" }}>
            <Settings className="w-3 h-3" /> Platform Settings
          </span>
          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight premium-text-primary">
            Settings
          </h1>
          <p className="text-sm premium-text-secondary mt-1.5 max-w-xl">
            Manage your profile, team, integrations, branding, and notification preferences.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-8">
        <div
          className="inline-flex items-center gap-1 p-1.5 rounded-2xl border"
          style={{ backgroundColor: "var(--theme-bg-card)", borderColor: "var(--theme-border)" }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap"
                style={{
                  backgroundColor: isActive ? "var(--theme-accent)" : "transparent",
                  color: isActive ? "var(--theme-accent-text)" : "var(--theme-text-secondary)",
                }}
              >
                <tab.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {renderContent()}
    </div>
  );
}
