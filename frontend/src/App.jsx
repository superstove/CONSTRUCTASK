import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { api } from "./api/client.js";
import Sidebar from "./components/Sidebar.jsx";
import AddProject from "./pages/AddProject.jsx";
import Approvals from "./pages/Approvals.jsx";
import Chat from "./pages/Chat.jsx";
import Compliance from "./pages/Compliance.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Materials from "./pages/Materials.jsx";
import ScanLog from "./pages/ScanLog.jsx";
import VerifyQR from "./pages/VerifyQR.jsx";

const pageTitles = {
  dashboard: "Construction project intelligence",
  chat: "Evidence Assistant",
  materials: "Material identity and QR verification",
  verify: "Verify material for site use",
  scans: "Site Scan Log",
  approvals: "Approval workflow and overdue blockers",
  compliance: "Compliance expiry and approval readiness",
  addproject: "Create a construction project"
};

export default function App() {
  const [activePage, setActivePage] = useState("dashboard");
  const [projects, setProjects] = useState([]);
  const [projectId, setProjectId] = useState(1);
  const [projectError, setProjectError] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("constructask-theme") || "dark");
  const [navBadges, setNavBadges] = useState({});

  function refreshProjects() {
    return api.listProjects()
      .then((items) => {
        setProjects(items);
        if (items.length > 0) {
          setProjectId((currentId) => (items.some((project) => project.id === currentId) ? currentId : items[0].id));
        }
      })
      .catch((err) => setProjectError(err.message));
  }

  useEffect(() => {
    refreshProjects();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("constructask-theme", theme);
  }, [theme]);

  useEffect(() => {
    let active = true;
    if (!projectId) return undefined;

    api.actionQueue(projectId)
      .then((actions) => {
        if (!active) return;
        const countByCategory = (category) => actions.filter((item) => item.category === category).length;
        setNavBadges({
          dashboard: actions.length,
          materials: countByCategory("Material") + countByCategory("QR Scan"),
          verify: countByCategory("Material") + countByCategory("Certificate"),
          scans: countByCategory("QR Scan"),
          approvals: countByCategory("Approval"),
          compliance: countByCategory("Certificate"),
          chat: actions.length
        });
      })
      .catch(() => {
        if (active) setNavBadges({});
      });

    return () => {
      active = false;
    };
  }, [projectId]);

  function handleProjectCreated(project) {
    setProjects((current) => {
      if (current.some((item) => item.id === project.id)) return current;
      return [...current, project];
    });
    setProjectId(project.id);
    setActivePage("dashboard");
  }

  const selectedProject = projects.find((project) => project.id === projectId);
  const riskLevel = (selectedProject?.risk_score || "Medium").toLowerCase();

  const pages = {
    dashboard: <Dashboard projectId={projectId} selectedProject={selectedProject} onNavigate={setActivePage} />,
    chat: <Chat projectId={projectId} selectedProject={selectedProject} />,
    materials: <Materials projectId={projectId} />,
    verify: <VerifyQR projectId={projectId} selectedProject={selectedProject} onNavigate={setActivePage} />,
    scans: <ScanLog projectId={projectId} />,
    approvals: <Approvals projectId={projectId} />,
    compliance: <Compliance projectId={projectId} />,
    addproject: <AddProject onSuccess={handleProjectCreated} />
  };

  return (
    <div className="app-shell">
      <Sidebar
        activePage={activePage}
        projects={projects}
        projectId={projectId}
        projectError={projectError}
        selectedProject={selectedProject}
        navBadges={navBadges}
        theme={theme}
        onNavigate={setActivePage}
        onProjectChange={setProjectId}
        onThemeChange={setTheme}
      />
      <main className={`main-content page-${activePage}`}>
        <header className="topbar">
          <div>
            <p className="eyebrow">ConstructAsk demo</p>
            <h1>{pageTitles[activePage]}</h1>
            <div className="topbar-command-line">
              <span>Evidence graph online</span>
              <span>QR trail synced</span>
              <span>Release gates monitored</span>
            </div>
          </div>
          <div className="topbar-card topbar-status">
            <span className={`status-pill ${riskLevel}`}>
              <span className="status-dot"></span>
              {selectedProject ? `${selectedProject.risk_score} Risk` : "Loading"}
            </span>
            <span className="status-pill ok">
              <span className="status-dot"></span>
              API Ready
            </span>
            <strong>{selectedProject ? selectedProject.name : "Loading project data"}</strong>
          </div>
        </header>
        <AnimatePresence mode="wait">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            {pages[activePage]}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
