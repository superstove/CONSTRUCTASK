import { Bot, FileCheck2, HardHat, History, LayoutDashboard, MoonStar, PackageSearch, PlusCircle, QrCode, ShieldCheck, SunMedium } from "lucide-react";

const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "chat", label: "Ask AI", icon: Bot },
  { id: "materials", label: "Materials", icon: PackageSearch },
  { id: "verify", label: "Verify Material", icon: QrCode },
  { id: "scans", label: "Scan Log", icon: History },
  { id: "approvals", label: "Approvals", icon: FileCheck2 },
  { id: "compliance", label: "Compliance", icon: ShieldCheck },
  { id: "addproject", label: "Add Project", icon: PlusCircle }
];

export default function Sidebar({
  activePage,
  projects,
  projectId,
  projectError,
  selectedProject,
  navBadges = {},
  theme,
  onNavigate,
  onProjectChange,
  onThemeChange
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <button className="brand" type="button" onClick={() => onNavigate("dashboard")}>
          <span className="brand-mark">
            <HardHat size={22} />
          </span>
          <span>
            <strong>ConstructAsk</strong>
            <small>Construction Intelligence</small>
          </span>
        </button>
        <button
          className="theme-toggle"
          type="button"
          onClick={() => onThemeChange(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <SunMedium size={18} /> : <MoonStar size={18} />}
        </button>
      </div>

      <nav className="nav-list">
        {nav.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={activePage === item.id ? "active" : ""}
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {navBadges[item.id] ? <span className="nav-badge">{navBadges[item.id]}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="project-switcher">
        <div className="project-switcher-top">
          <label htmlFor="project-select">Active project</label>
          {selectedProject ? <span className={`project-risk-badge ${selectedProject.risk_score.toLowerCase()}`}>{selectedProject.risk_score}</span> : null}
        </div>
        <select
          id="project-select"
          value={projectId}
          onChange={(event) => onProjectChange(Number(event.target.value))}
          disabled={projects.length === 0}
        >
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
        {selectedProject ? <small>{selectedProject.location}</small> : null}
        {projectError ? <small className="project-error">API project list unavailable</small> : null}
      </div>

      <div className="sidebar-note">
        <strong>Demo projects</strong>
        <span>NH66 Highway + Metro Bridge</span>
        <p>Materials, QR scans, approvals, compliance, and delivery records follow the selected project.</p>
      </div>

      <div className="sidebar-user">
        <span>CA</span>
        <div>
          <strong>Site Command</strong>
          <small>Evidence operator</small>
        </div>
      </div>
    </aside>
  );
}
