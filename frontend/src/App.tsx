import React, { useState, useEffect, useRef } from "react";
import { Menu } from "lucide-react";
import Lenis from "lenis";
import "lenis/dist/lenis.css";
import Sidebar, { ActiveTab } from "./components/Sidebar";
import LoginScreen from "./components/LoginScreen";
import WelcomeGuide from "./components/WelcomeGuide";
import PublicVerify from "./components/PublicVerify";
import QrLabel from "./components/QrLabel";
import { supabase } from "./lib/supabaseClient";
// Lazy-loaded per-tab screens — each becomes its own chunk so first load is light.
const CommandCenter = React.lazy(() => import("./components/CommandCenter"));
const ProductPassports = React.lazy(() => import("./components/ProductPassports"));
const LifecycleIntelligence = React.lazy(() => import("./components/LifecycleIntelligence"));
const ComplianceHub = React.lazy(() => import("./components/ComplianceHub"));
const AuditTrail = React.lazy(() => import("./components/AuditTrail"));
const EvidenceAssistant = React.lazy(() => import("./components/EvidenceAssistant"));
const ScanLog = React.lazy(() => import("./components/ScanLog"));
const ProjectIntelligence = React.lazy(() => import("./components/ProjectIntelligence"));
const AboutPage = React.lazy(() => import("./components/AboutPage"));
const SettingsPage = React.lazy(() => import("./components/SettingsPage"));
import GlobalSearchModal from "./components/GlobalSearchModal";
import {
  askAssistant,
  createProject,
  getProjectBundle,
  listProjects,
  listUsers,
  createUser,
  deleteUser,
  FrontendUser,
  FrontendApproval,
  updateApproval,
  updateMaterialStage,
  createMaterial,
  exchangeGoogleSession,
  getStoredAppToken,
  clearAppSession,
} from "./api/backendClient";

import { Project, ProductPassport, AuditBlock, ComplianceCertificate, VisualTheme, DashboardMetrics } from "./types";
import { Building, ChevronDown, Check, Plus, AlertTriangle, ShieldCheck, Search } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

export default function App() {
  const [activeTab, setActiveTab ] = useState<ActiveTab>("command");
  // Sub-tab requested from the expandable sidebar (e.g. "readiness", "registry").
  const [requestedSubTab, setRequestedSubTab] = useState<string | null>(null);
  const handleSelectSubTab = (tab: ActiveTab, subId: string) => {
    setActiveTab(tab);
    // Append a nonce so re-clicking the same sub-item always re-triggers the jump.
    setRequestedSubTab(`${subId}#${Date.now()}`);
  };

  // Sign out: clear the demo flag + app token + Supabase session, then show the login page.
  const handleLogout = async () => {
    localStorage.removeItem("constructask_demo");
    clearAppSession();
    if (supabase) {
      try { await supabase.auth.signOut(); } catch (err) { console.error("Sign-out failed:", err); }
    }
    setAuthStatus("signedout");
  };
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lenisRef = useRef<Lenis | null>(null);

  // Auth gate: Google (via Supabase) or the classic demo account.
  const [authStatus, setAuthStatus] = useState<"loading" | "signedout" | "ready">("loading");

  // First-visit welcome guide (reopenable from the header "?" button).
  const [showWelcome, setShowWelcome] = useState(
    () => localStorage.getItem("constructask_welcome_seen") !== "1"
  );
  const closeWelcome = () => {
    localStorage.setItem("constructask_welcome_seen", "1");
    setShowWelcome(false);
  };

  useEffect(() => {
    const initAuth = async () => {
      if (getStoredAppToken() || localStorage.getItem("constructask_demo") === "1") {
        setAuthStatus("ready");
        return;
      }
      if (supabase) {
        // Handles the redirect back from Google sign-in.
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          try {
            await exchangeGoogleSession(session.access_token);
            setAuthStatus("ready");
            return;
          } catch (err) {
            console.error("Google session exchange failed:", err);
          }
        }
      }
      setAuthStatus("signedout");
    };
    initAuth();
  }, []);

  // Smooth scrolling (Lenis) on the main content area — the app's real scroll
  // container is <main>, not the window. Nested scrollers (chat, tables) still
  // work via allowNestedScroll.
  useEffect(() => {
    if (authStatus !== "ready") return;
    const wrapper = mainRef.current;
    const content = contentRef.current;
    if (!wrapper || !content) return;

    const lenis = new Lenis({
      wrapper,
      content,
      duration: 1.1,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      allowNestedScroll: true,
    });
    lenisRef.current = lenis;

    let rafId = 0;
    const raf = (time: number) => {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    };
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [authStatus]);

  useEffect(() => {
    if (lenisRef.current) {
      lenisRef.current.scrollTo(0, { immediate: true });
    } else if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, behavior: "instant" });
    }
  }, [activeTab]);
  
  const [selectedPassportId, setSelectedPassportId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const [activeTheme, setActiveTheme] = useState<VisualTheme>(() => {
    const saved = localStorage.getItem("premium_theme");
    return (saved as VisualTheme) || "dark";
  });
  
  useEffect(() => {
    localStorage.setItem("premium_theme", activeTheme);
  }, [activeTheme]);

  // Project Selection states
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [projectsList, setProjectsList] = useState<Array<{ id: string; name: string; location: string; manager: string; risk: "HIGH" | "LOW" }>>([]);

  // Loaded compliance datasets
  const [project, setProject] = useState<Project | null>(null);
  const [passports, setPassports] = useState<ProductPassport[]>([]);
  const [certificates, setCertificates] = useState<ComplianceCertificate[]>([]);
  const [auditTrail, setAuditTrail] = useState<AuditBlock[]>([]);
  
  // User Management states
  const [usersList, setUsersList] = useState<FrontendUser[]>([]);
  const [activeUser, setActiveUser] = useState<FrontendUser | null>(null);
  
  // Real dynamic REST endpoint compliance states
  const [dashboardData, setDashboardData] = useState<any>(null);
  const [executiveSummary, setExecutiveSummary] = useState<any>(null);
  const [materialsData, setMaterialsData] = useState<any>(null);
  const [certificatesData, setCertificatesData] = useState<any>(null);
  const [scansData, setScansData] = useState<any>(null);
  const [approvalsData, setApprovalsData] = useState<FrontendApproval[]>([]);
  const [risksList, setRisksList] = useState<any[]>([]);
  const [intelligenceData, setIntelligenceData] = useState<any>(null);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStageUpdating, setIsStageUpdating] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Redirection prefilled AI prompt state
  const [prefilledPrompt, setPrefilledPrompt] = useState<string | null>(null);

  // Hydrate data from the existing FastAPI backend and adapt it to this premium UI shell.
  const fetchAllData = async (silent = false, projectId = selectedProjectId) => {
    if (!projectId) return;
    if (!silent) setIsRefreshing(true);
    try {
      setLoadError(null);
      const bundle = await getProjectBundle(projectId);
      setDashboardData(bundle.dashboardData);
      setExecutiveSummary(bundle.executiveSummary);
      setMaterialsData(bundle.materialsData);
      setPassports(bundle.passports);
      setCertificatesData(bundle.certificatesData);
      setCertificates(bundle.certificates);
      setApprovalsData(bundle.approvalsData);
      setScansData(bundle.scansData);
      setRisksList(bundle.risksList);
      setIntelligenceData(bundle.intelligenceData);
      setProject(bundle.project);
      setAuditTrail(bundle.auditTrail);

    } catch (err) {
      console.error("Unable to execute initial systems sync:", err);
      setLoadError("Unable to load this project from the backend. Refresh projects or check the API server.");
    } finally {
      if (!silent) setIsRefreshing(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const data = await listProjects();
      if (data.length) {
        setProjectsList(data);
        setSelectedProjectId((current) => {
          const nextProjectId = data.some((project) => project.id === current) ? current : data[0].id;
          if (nextProjectId !== current) {
            setProject(null);
          }
          return nextProjectId;
        });
      } else {
        setLoadError("No projects were returned by the backend.");
      }
    } catch (err) {
      console.error("Failed to load projects list from server:", err);
      setLoadError("Backend project list is not reachable.");
    }
  };

  const fetchUsers = async () => {
    try {
      let users = await listUsers();
      if (users.length === 0) {
        // Seed a single demo user for testing
        await createUser({ name: "Anton Demo", email: "demo@constructask.dev", role: "Project Manager" });
        users = await listUsers();
      }
      
      setUsersList(users);
      const defaultUser = users[0] || null;
      setActiveUser(defaultUser);
    } catch (err) {
      console.error("Failed to load or seed users:", err);
    }
  };

  useEffect(() => {
    if (authStatus !== "ready") return;
    fetchProjects();
    fetchUsers();
  }, [authStatus]);

  useEffect(() => {
    if (selectedProjectId && projectsList.some((project) => project.id === selectedProjectId)) {
      fetchAllData(false, selectedProjectId);
    }
  }, [selectedProjectId, projectsList]);

  const handleAddNewProject = async (newProj: { name: string; location: string; manager: string }) => {
    try {
      const projectOption = await createProject(newProj);
      await fetchProjects();
      setSelectedProjectId(projectOption.id);
      return projectOption;
    } catch (err) {
      console.error("Failed to register new ledger:", err);
    }
    return null;
  };

  // Sync refresh button hander
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchAllData();
    setIsRefreshing(false);
  };

  const handleUpdateApproval = async (id: number, status: "approved" | "rejected" | "pending") => {
    const updated = await updateApproval(id, status);
    setApprovalsData((current) =>
      current.map((approval) => (approval.id === updated.id ? updated : approval))
    );
    await fetchAllData(true);
  };

  // Navigate to tab and optionally focus a passport or record or fill prompt
  const handleNavigateTo = (tab: ActiveTab, actionQuery?: string) => {
    setActiveTab(tab);
    if (tab === "passports" && actionQuery) {
      setSelectedPassportId(actionQuery);
    } else if (actionQuery) {
      setPrefilledPrompt(actionQuery);
    }
  };

  const handleUpdateStage = async (id: string, stage: string, details: string, operatorName?: string) => {
    setIsStageUpdating(true);
    try {
      await updateMaterialStage(Number(id), stage.toLowerCase());
      await fetchAllData(true);
    } catch (err) {
      console.error("Stage update failure:", err);
    } finally {
      setIsStageUpdating(false);
    }
  };

  const handleCreateMaterial = async (material: {
    name: string;
    batch_id: string;
    supplier: string;
    category?: string;
  }) => {
    try {
      await createMaterial({
        ...material,
        project_id: Number(selectedProjectId),
      });
      await fetchAllData(true);
    } catch (err) {
      console.error("Failed to create material:", err);
    }
  };

  // Conversational API assistant queries secure channel
  const handleSendMessage = async (text: string) => {
    try {
      return await askAssistant(text, selectedProjectId);
    } catch (err: any) {
      console.error("Assistant execution failure:", err);
      throw err;
    }
  };

  // Compute Active selected project object from active reactive state
  const activeProj = project;

  const overdueGatesCount = 0;

  // Public, no-login routes (reached by scanning a material QR). Checked before the
  // auth gate so anyone can verify a material or print its label without signing in.
  const publicParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const verifyId = publicParams?.get("verify");
  const labelId = publicParams?.get("label");
  if (verifyId) return <PublicVerify materialId={verifyId} />;
  if (labelId) return <QrLabel materialId={labelId} />;

  if (authStatus === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-400 font-bold animate-pulse">
          Authenticating…
        </span>
      </div>
    );
  }

  if (authStatus === "signedout") {
    return (
      <LoginScreen
        onDemoLogin={() => {
          localStorage.setItem("constructask_demo", "1");
          setAuthStatus("ready");
        }}
      />
    );
  }

  return (
    <div id="construct-ask-app" className={`flex min-h-screen theme-${activeTheme} text-[var(--theme-text-primary)] bg-[var(--theme-bg-app)] font-sans transition-colors duration-250 relative overflow-hidden`}>
      {/* Primary Sidebar Structure */}
      <Sidebar 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        projectName={activeProj?.name || "NH66 Highway Slope Protection"}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        activeTheme={activeTheme}
        setActiveTheme={setActiveTheme}
        selectedProjectId={selectedProjectId}
        setSelectedProjectId={setSelectedProjectId}
        projectsList={projectsList}
        overdueGatesCount={overdueGatesCount}
        materialsCount={passports.length}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAddProject={handleAddNewProject}
        activeUser={activeUser}
        usersList={usersList}
        onSelectSubTab={handleSelectSubTab}
        onNavigateToTab={handleNavigateTo}
        onLogout={handleLogout}
        onSwitchUser={(usr) => setActiveUser(usr)}
        onAddUser={async (usr) => {
          try {
            const created = await createUser(usr);
            setUsersList((prev) => [...prev, created]);
          } catch (err) {
            console.error("Failed to add user:", err);
          }
        }}
        onDeleteUser={async (id) => {
          try {
            await deleteUser(id);
            setUsersList((prev) => prev.filter((u) => u.id !== id));
            if (activeUser?.id === id) {
              setActiveUser(null);
            }
          } catch (err) {
            console.error("Failed to delete user:", err);
          }
        }}
      />

      {/* Main Content Scrolling Frame & Mobile Headers */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        {/* Desktop & Mobile Header Bar with Project Switcher */}
        <header className="shrink-0 flex items-center justify-between border-b border-neutral-200 premium-bg-sub px-4 py-3 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 text-neutral-600 hover:text-black rounded-lg hover:bg-neutral-100 transition-colors border border-neutral-250 cursor-pointer flex items-center justify-center bg-white"
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="lg:hidden flex items-center gap-2">
              <div className="w-7 h-7 bg-black rounded-xl flex items-center justify-center shrink-0">
                <div className="w-3.5 h-3.5 border border-white rounded-full"></div>
              </div>
              <span className="text-xs font-bold font-sans tracking-tight premium-text-primary leading-tight">
                Construct Ask
              </span>
            </div>
            
            <div className="hidden lg:flex items-center">
              <span className="text-sm font-bold font-sans text-neutral-800">
                {activeTab === "command" ? "Command Center" : activeTab === "project-intelligence" ? "Project Intelligence" : activeTab === "passports" ? "Product Passports" : activeTab === "lifecycle" ? "Lifecycle Intelligence" : activeTab === "compliance" ? "Compliance Hub" : activeTab === "audit" ? "Audit Trail" : activeTab === "scan" ? "Scan Log" : activeTab === "settings" ? "Settings" : activeTab === "about" ? "About" : "Evidence Assistant"}
              </span>
            </div>
            
            <div className="hidden md:flex ml-4">
              <button 
                onClick={() => setIsSearchOpen(true)}
                className="relative flex items-center gap-2 lg:w-72 w-52 bg-neutral-900/50 hover:bg-neutral-800/80 border border-white/10 px-4 py-2 rounded-full text-neutral-300 transition-all duration-300 group cursor-text overflow-hidden shadow-inner"
              >
                {/* Glowing border effect on hover */}
                <div className="absolute inset-0 rounded-full bg-gradient-to-r from-cyan-500/0 via-cyan-500/10 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
                
                <Search className="w-4 h-4 text-cyan-400 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)] animate-pulse group-hover:scale-110 transition-transform duration-300 relative z-10" />
                
                <span className="text-xs font-medium flex-1 text-left relative z-10 tracking-wide text-neutral-400 group-hover:text-neutral-200 transition-colors">Search anything...</span>
                <div className="flex items-center gap-1 opacity-80 relative z-10">
                  <span className="text-[9px] font-mono border border-white/20 bg-white/10 rounded-md px-1.5 py-0.5 font-bold shadow-xs text-white/90 backdrop-blur-md">Ctrl</span>
                  <span className="text-[9px] font-mono border border-white/20 bg-white/10 rounded-md px-1.5 py-0.5 font-bold shadow-xs text-white/90 backdrop-blur-md">K</span>
                </div>
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-2 bg-neutral-50 border border-neutral-200/60 px-3 py-1.5 rounded-lg shadow-xs">
              <Building className="w-3.5 h-3.5 text-neutral-400" />
              <span className="text-xs font-bold text-neutral-700 tracking-tight">{activeProj?.name || selectedProjectId}</span>
            </div>
            <button
              onClick={() => setShowWelcome(true)}
              className="w-7 h-7 rounded-full border border-neutral-250 bg-white text-neutral-500 hover:text-black hover:bg-neutral-50 transition-colors text-xs font-bold cursor-pointer flex items-center justify-center"
              title="What is Construct Ask? Open the platform guide"
              aria-label="Open platform guide"
            >
              ?
            </button>
          </div>
        </header>

        {showWelcome && <WelcomeGuide onClose={closeWelcome} />}
        
        <GlobalSearchModal 
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          passports={passports}
          certificates={certificates}
          approvals={approvalsData}
          auditTrail={auditTrail}
          onNavigate={handleNavigateTo}
        />

        {/* Scrollable View Area */}
        <main ref={mainRef} className="flex-1 overflow-y-auto relative premium-bg-app">
          <div ref={contentRef}>
          {/* Render Active View Tab */}
          <React.Suspense fallback={<div className="p-10 text-[11px] font-mono uppercase tracking-widest text-neutral-400">Loading…</div>}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "command" && (
                loadError ? (
              <div className="p-8 max-w-3xl">
                <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-sm text-red-800">
                  <strong className="block text-red-900 mb-1">Project metrics could not load.</strong>
                  <span>{loadError}</span>
                  <button
                    onClick={() => {
                      fetchProjects();
                      if (selectedProjectId) fetchAllData(false, selectedProjectId);
                    }}
                    className="block mt-4 bg-red-700 text-white rounded-lg px-4 py-2 text-xs font-bold uppercase"
                  >
                    Retry
                  </button>
                </div>
              </div>
            ) : (
              <CommandCenter 
                project={activeProj}
                dashboardData={dashboardData}
                executiveSummary={executiveSummary}
                materialsData={materialsData}
                certificatesData={certificatesData}
                scansData={scansData}
                risksList={risksList}
                onNavigateTo={handleNavigateTo}
                selectedProjectId={selectedProjectId}
              />
            )
          )}

          {activeTab === "project-intelligence" && (
            <ProjectIntelligence
              intelligenceData={intelligenceData}
              onAddMaterial={() => setActiveTab("passports")}
              onScanQr={() => setActiveTab("scan")}
              requestedSubTab={requestedSubTab}
            />
          )}

          {activeTab === "passports" && (
            <ProductPassports
              passports={passports}
              certificates={certificates}
              project={activeProj}
              selectedProjectId={selectedProjectId}
              selectedId={selectedPassportId}
              onSelectId={setSelectedPassportId}
              onUpdateStage={handleUpdateStage}
              isUpdating={isStageUpdating}
              onCreateMaterial={handleCreateMaterial}
              requestedSubTab={requestedSubTab}
            />
          )}

          {activeTab === "lifecycle" && (
            <LifecycleIntelligence 
              project={activeProj}
              onNavigateToTab={handleNavigateTo}
            />
          )}

          {activeTab === "compliance" && (
            <ComplianceHub 
              certificates={certificates}
              approvals={approvalsData}
              projectName={activeProj?.name}
              auditTrail={auditTrail}
              onUpdateApproval={handleUpdateApproval}
              onNavigateToTab={handleNavigateTo}
            />
          )}

          {activeTab === "audit" && (
            <AuditTrail 
              auditTrail={auditTrail}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
            />
          )}

          {activeTab === "assistant" && (
            <EvidenceAssistant 
              onSendMessage={handleSendMessage}
              prefilledPrompt={prefilledPrompt}
              setPrefilledPrompt={setPrefilledPrompt}
            />
          )}

          {activeTab === "scan" && (
            <ScanLog scanLogs={scansData?.logs || []} onRefresh={handleRefresh} selectedProjectId={selectedProjectId} />
          )}

          {activeTab === "about" && (
            <AboutPage />
          )}

          {activeTab === "settings" && (
            <SettingsPage />
          )}
            </motion.div>
          </AnimatePresence>
          </React.Suspense>

          </div>
        </main>
      </div>
    </div>
  );
}
