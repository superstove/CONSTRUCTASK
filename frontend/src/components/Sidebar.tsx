import React from "react";
import { 
  Building,
  Gauge,
  Layers,
  Activity,
  FileCheck,
  Network,
  MessageSquareCode,
  Palette,
  RefreshCw,
  X,
  Plus,
  ChevronDown,
  ChevronUp,
  Check,
  FolderPlus,
  MapPin,
  User,
  Search,
  ShieldCheck,
  QrCode,
  PackagePlus
} from "lucide-react";
import { VisualTheme } from "../types";
import { supabase } from "../lib/supabaseClient";

export type ActiveTab = 
  | "command" 
  | "project-intelligence"
  | "passports" 
  | "lifecycle" 
  | "compliance" 
  | "audit" 
  | "assistant"
  | "scan";

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  projectName: string;
  onRefresh: () => void;
  isRefreshing: boolean;
  activeTheme: VisualTheme;
  setActiveTheme: (theme: VisualTheme) => void;
  selectedProjectId: string;
  setSelectedProjectId: (id: string) => void;
  projectsList: Array<{ id: string; name: string; location: string; manager: string; risk: "HIGH" | "LOW" }>;
  overdueGatesCount: number;
  materialsCount: number;
  isOpen?: boolean;
  onClose?: () => void;
  onAddProject?: (proj: { name: string; location: string; manager: string }) => Promise<any>;
  activeUser: any;
  usersList: any[];
  onSwitchUser: (user: any) => void;
  onAddUser: (user: { name: string; email: string; role: string }) => Promise<any>;
  onDeleteUser?: (id: number) => Promise<any>;
  onSelectSubTab?: (tab: ActiveTab, subId: string) => void;
}

export default function Sidebar({ 
  activeTab, 
  setActiveTab, 
  projectName, 
  onRefresh, 
  isRefreshing,
  activeTheme,
  setActiveTheme,
  selectedProjectId,
  setSelectedProjectId,
  projectsList,
  overdueGatesCount,
  materialsCount,
  isOpen = false,
  onClose,
  onAddProject,
  activeUser,
  usersList,
  onSwitchUser,
  onAddUser,
  onDeleteUser,
  onSelectSubTab
}: SidebarProps) {

  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [expandedItem, setExpandedItem] = React.useState<ActiveTab | null>(activeTab);
  const [showAddModal, setShowAddModal ] = React.useState(false);
  
  // New Project Form state inside sidebar modal
  const [newProjName, setNewProjName] = React.useState("");
  const [newProjLocation, setNewProjLocation] = React.useState("");
  const [newProjManager, setNewProjManager] = React.useState("Anand AK");
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  // User Switcher and Creation States
  const [userMenuOpen, setUserMenuOpen] = React.useState(false);
  const [showAddUserModal, setShowAddUserModal] = React.useState(false);
  const [newUserName, setNewUserName] = React.useState("");
  const [newUserEmail, setNewUserEmail] = React.useState("");
  const [newUserRole, setNewUserRole] = React.useState("Evidence Operator");

  const navSections: Array<{title: string, items: Array<{id: ActiveTab, name: string, icon: any, description: string, subItems?: Array<{sub: string, name: string}>}>}> = [
    {
      title: "Core Platform",
      items: [
         { id: "command", name: "Command Center", icon: Gauge, description: "Executive dashboard" },
         { id: "project-intelligence", name: "Project Intelligence", icon: Layers, description: "Intelligence breakdown", subItems: [
           { sub: "needs-attention", name: "Needs Attention" },
           { sub: "readiness", name: "Readiness Breakdown" },
           { sub: "supplier-health", name: "Supplier Health" },
           { sub: "risk-analysis", name: "Risk Analysis" },
           { sub: "delivery", name: "Delivery Intelligence" },
         ] },
         { id: "lifecycle", name: "Lifecycle Intelligence", icon: Activity, description: "Tracing chain events" },
         { id: "compliance", name: "Compliance Hub", icon: FileCheck, description: "Quality cert audits" },
         { id: "audit", name: "Audit Trail", icon: Network, description: "Verifiable hash links" },
         { id: "passports", name: "Product Passports", icon: Building, description: "Digital Identity & Origin", subItems: [
           { sub: "overview", name: "Overview" },
           { sub: "registry", name: "Material Registry" },
           { sub: "verify", name: "Verify Material" },
           { sub: "explorer", name: "Passport Explorer" },
           { sub: "supplier", name: "Supplier Records" },
           { sub: "lifecycle", name: "Lifecycle Chain" },
         ] },
         { id: "scan", name: "Scan Log", icon: ShieldCheck, description: "Verify materials" },
      ]
    },
    {
      title: "AI Assistants",
      items: [
        { id: "assistant", name: "Evidence Assistant", icon: MessageSquareCode, description: "Interactive compliance QA" },
      ]
    }
  ];

  const themes = [
    { id: "light", name: "Light", dotClass: "bg-white border-neutral-300" },
    { id: "sand", name: "Sands", dotClass: "bg-[#f4ebe1] border-[#d4c5b3]" },
    { id: "nordic", name: "Nordic", dotClass: "bg-[#d0e0dc] border-[#a0c0b8]" },
    { id: "cosmic", name: "Cosmic", dotClass: "bg-[#0f0f12] border-[#2d2d35]" }
  ] as const;

  const selectedProj = projectsList.find(p => p.id === selectedProjectId) || projectsList[0];

  return (
    <>
      {/* Backdrop overlay for mobile to tap outside and dismiss */}
      {isOpen && (
        <div 
          onClick={onClose}
          className="lg:hidden fixed inset-0 bg-neutral-950/40 z-40 backdrop-blur-xs transition-opacity duration-200 cursor-pointer"
        />
      )}

      <aside 
        id="sidebar-container"
        className={`fixed lg:sticky lg:top-0 inset-y-0 left-0 z-50 w-80 premium-sidebar h-screen flex flex-col justify-between border-r shrink-0 transition-transform duration-350 ${
          isOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full lg:translate-x-0 lg:flex"
        }`}
      >
        {/* Top Brand Section */}
        <div className="p-6 flex-1 overflow-y-auto max-h-[calc(100vh-180px)]">
          <div className="flex items-center justify-between mb-8 gap-2">
            <div 
              onClick={() => {
                setActiveTab("command");
                onClose?.();
              }}
              title="Go to Home"
              className="flex-1 flex items-center gap-3 bg-neutral-50 px-3.5 py-3 rounded-xl border border-neutral-200/60 premium-bg-sub premium-border cursor-pointer hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <div className="w-9 h-9 bg-black rounded-lg flex items-center justify-center shrink-0 shadow-xs">
                <div className="w-3.5 h-3.5 border-2 border-white rounded-full"></div>
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight premium-text-primary leading-tight">
                  ConstructAsk
                </h1>
                <p className="text-[9px] font-mono uppercase tracking-widest premium-text-secondary font-bold mt-0.5 whitespace-nowrap">
                  PROJECT INTELLIGENCE
                </p>
              </div>
            </div>

            {/* mobile close menu button */}
            <button
              onClick={onClose}
              className="lg:hidden p-2 text-neutral-500 hover:text-neutral-900 bg-neutral-50 hover:bg-neutral-100 rounded-lg border border-neutral-200 cursor-pointer flex items-center justify-center shrink-0"
              aria-label="Close menu"
            >
              <X className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Project Switcher Component */}
          <div className="mb-6 relative">
            <label className="px-4 text-[9px] font-mono text-neutral-400 font-bold uppercase tracking-widest mb-1.5 block">
              Active Project
            </label>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="w-full flex items-center justify-between gap-2 bg-white hover:bg-neutral-50/55 border border-neutral-200 px-4 py-2.5 rounded-xl shadow-xs transition-all cursor-pointer text-left focus:ring-1 focus:ring-black"
            >
              <div className="flex items-center gap-2.5 overflow-hidden">
                <Building className="w-4 h-4 text-neutral-500 shrink-0" />
                <div className="overflow-hidden leading-tight">
                  <span className="text-xs font-bold text-neutral-800 tracking-tight block truncate">
                    {selectedProj?.name || "Select Project"}
                  </span>
                  <span className="text-[9px] text-neutral-400 font-mono block truncate">
                    {selectedProj?.location || "No location"}
                  </span>
                </div>
              </div>
              <ChevronDown className={`w-3.5 h-3.5 text-neutral-400 transition-transform shrink-0 ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>

            {dropdownOpen && (
              <div className="absolute left-0 right-0 mt-1 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto premium-card p-1 divide-y divide-neutral-100">
                {projectsList.map((p) => {
                  const isCurrent = p.id === selectedProjectId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedProjectId(p.id);
                        setDropdownOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center justify-between gap-3 transition-colors ${
                        isCurrent 
                          ? "bg-neutral-50 font-bold text-neutral-900" 
                          : "hover:bg-neutral-50 text-neutral-700"
                      }`}
                    >
                      <div className="overflow-hidden leading-tight">
                        <p className="text-xs font-bold truncate">{p.name}</p>
                        <p className="text-[9px] text-neutral-400 truncate">{p.location}</p>
                      </div>
                      {isCurrent && <Check className="w-3.5 h-3.5 text-neutral-950 shrink-0" />}
                    </button>
                  );
                })}
                {onAddProject && (
                  <button
                    onClick={() => {
                      setDropdownOpen(false);
                      setShowAddModal(true);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-neutral-500 hover:text-black hover:bg-neutral-50 flex items-center gap-2 transition-colors font-medium border-t border-neutral-100"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Provision New Ledger</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Quick Actions — fast shortcuts to the actions Anton/site users do most */}
          <div className="px-4 mb-5">
            <h3 className="text-[9px] font-mono text-neutral-400 font-bold uppercase tracking-widest mb-2">
              QUICK ACTIONS
            </h3>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                id="quick-scan-qr"
                onClick={() => { setActiveTab("scan"); onClose?.(); }}
                className="flex items-center justify-center gap-1.5 bg-black text-white rounded-lg px-2 py-2 text-[10.5px] font-bold hover:bg-neutral-800 transition-colors cursor-pointer"
                title="Open Scan Log to scan a QR and verify a material"
              >
                <QrCode className="w-3.5 h-3.5" /> Scan QR
              </button>
              <button
                id="quick-add-material"
                onClick={() => { setActiveTab("passports"); onClose?.(); }}
                className="flex items-center justify-center gap-1.5 bg-white border border-neutral-250 text-neutral-800 rounded-lg px-2 py-2 text-[10.5px] font-bold hover:bg-neutral-50 transition-colors cursor-pointer"
                title="Add a new material (opens Product Passports)"
              >
                <PackagePlus className="w-3.5 h-3.5" /> Add Material
              </button>
            </div>
          </div>

          {/* Menu Items */}
          <div className="space-y-6">
            {navSections.map((section) => (
              <div key={section.title}>
                <h3 className="px-4 text-[9px] font-mono text-neutral-400 font-bold uppercase tracking-widest mb-2 flex items-center gap-2">
                   {section.title}
                </h3>
                <nav className="space-y-0.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const IsSelected = activeTab === item.id;
                    const hasSub = !!item.subItems?.length;
                    const isExpanded = expandedItem === item.id;
                    return (
                      <div key={item.id}>
                        <button
                          id={`nav-tab-${item.id}`}
                          onClick={() => {
                            setActiveTab(item.id);
                            if (hasSub) {
                              setExpandedItem((prev) => (prev === item.id ? null : item.id));
                            } else {
                              setExpandedItem(null);
                              onClose?.();
                            }
                          }}
                          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left transition-all duration-150 group cursor-pointer leading-normal ${
                            IsSelected
                              ? "premium-sidebar-active font-medium shadow-xs"
                              : "text-neutral-500 hover:text-neutral-950 hover:bg-neutral-50/50"
                          }`}
                        >
                          <Icon className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                            IsSelected ? "text-[var(--theme-sidebar-active-text)]" : "text-neutral-400 group-hover:text-neutral-600"
                          }`} />
                          <span className="text-xs font-bold flex-1">{item.name}</span>
                          {hasSub && (
                            <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-neutral-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                          )}
                        </button>

                        {hasSub && isExpanded && (
                          <div className="mt-0.5 mb-1 ml-5 pl-3 border-l border-neutral-200 space-y-0.5">
                            {item.subItems!.map((s) => (
                              <button
                                key={s.sub}
                                onClick={() => {
                                  onSelectSubTab?.(item.id, s.sub);
                                  setActiveTab(item.id);
                                  onClose?.();
                                }}
                                className="w-full text-left px-3 py-1.5 rounded-md text-[11px] font-medium text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50/70 transition-colors cursor-pointer"
                              >
                                {s.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </nav>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col">
          {/* Aesthetic Switcher Ribbon */}
          <div className="p-6 border-t border-neutral-200/60 premium-border premium-bg-sub/30">
            <div className="flex items-center gap-1.5 mb-3">
              <Palette className="w-3 h-3 text-neutral-400" />
              <span className="text-[9px] font-mono font-bold uppercase tracking-widest premium-text-secondary">
                SIGNATURE AESTHETIC
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {themes.map((t) => {
                const IsActive = activeTheme === t.id;
                return (
                  <button
                    key={t.id}
                    id={`aesthetic-btn-${t.id}`}
                    onClick={() => {
                      setActiveTheme(t.id);
                      onClose?.();
                    }}
                    title={`Switch to ${t.name} aesthetic`}
                    className={`p-1.5 rounded-lg border flex flex-col items-center justify-center transition-all duration-200 cursor-pointer ${
                      IsActive
                        ? "border-neutral-900 bg-white shadow-sm font-bold scale-102"
                        : "border-neutral-200/50 bg-neutral-50 hover:border-neutral-400 text-neutral-400"
                    } premium-card`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full border shadow-sm ${t.dotClass}`} />
                    <span className="text-[8px] font-mono uppercase tracking-tight text-neutral-500 mt-1 font-bold">
                      {t.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Site Command / Evidence operator card */}
          <div className="relative p-5 border-t border-neutral-200 bg-neutral-50/55 premium-border premium-bg-sub flex items-center justify-between">
            {/* User switcher popup */}
            {userMenuOpen && (
              <div className="absolute bottom-[72px] left-4 right-4 bg-white border border-neutral-200 rounded-2xl shadow-xl p-3 z-50 flex flex-col gap-1 premium-card premium-border max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between px-2 pb-1 border-b mb-1 border-neutral-100">
                  <span className="text-[9px] font-mono text-neutral-400 uppercase tracking-widest font-bold">Switch Identity</span>
                  <button 
                    onClick={() => setShowAddUserModal(true)} 
                    className="p-1 rounded-md text-neutral-500 hover:text-black bg-neutral-50 border border-neutral-200 flex items-center justify-center cursor-pointer scale-90"
                    title="Add new user"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
                {usersList.map((usr) => (
                  <div key={usr.id} className="flex items-center justify-between hover:bg-neutral-50 rounded-lg p-1.5 transition-all group">
                    <button
                      onClick={() => {
                        onSwitchUser(usr);
                        setUserMenuOpen(false);
                      }}
                      className="flex-grow flex items-center gap-2 text-left cursor-pointer overflow-hidden"
                    >
                      <div className="w-6 h-6 rounded-full bg-neutral-100 flex items-center justify-center text-neutral-700 font-mono text-[9px] font-bold border shrink-0">
                        {usr.name.substring(0, 2).toUpperCase()}
                      </div>
                      <div className="overflow-hidden leading-tight flex-1">
                        <p className="text-[10px] font-bold premium-text-primary truncate">{usr.name}</p>
                        <p className="text-[8px] premium-text-secondary truncate">{usr.role}</p>
                      </div>
                    </button>
                    {activeUser?.id === usr.id ? (
                      <Check className="w-3 h-3 text-neutral-900 shrink-0 mr-1.5" />
                    ) : (
                      onDeleteUser && (
                        <button
                          onClick={() => onDeleteUser(usr.id)}
                          className="p-1 text-neutral-300 hover:text-red-500 rounded-md hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Delete user"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )
                    )}
                  </div>
                ))}
              </div>
            )}

            <button 
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex-grow flex items-center gap-2.5 overflow-hidden text-left hover:opacity-85 transition-opacity cursor-pointer mr-2"
            >
              <div className="w-8 h-8 rounded-full bg-neutral-900 flex items-center justify-center text-white font-mono text-[10px] font-bold border shrink-0">
                {activeUser ? activeUser.name.substring(0, 2).toUpperCase() : "CA"}
              </div>
              <div className="overflow-hidden leading-tight flex-1">
                <p className="text-[10px] font-bold premium-text-primary truncate">
                  {activeUser ? activeUser.name : "Anand AK"}
                </p>
                <p className="text-[9px] premium-text-secondary font-mono flex items-center gap-1 truncate">
                  <span>{activeUser ? activeUser.role : "Evidence operator"}</span>
                  <ChevronDown className="w-2.5 h-2.5 text-neutral-400 shrink-0" />
                </p>
              </div>
            </button>
            
            <button 
              id="refresh-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              className="text-neutral-600 hover:text-black transition-colors py-1 px-2.5 rounded-lg bg-white border border-neutral-300 flex items-center gap-1 shadow-xs text-[9px] font-mono cursor-pointer premium-card shrink-0 font-bold"
            >
              <RefreshCw className={`w-2 h-2 ${isRefreshing ? "animate-spin" : ""}`} />
              <span>SYNC</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Dynamic Ledger Provisioning Modal */}
      {showAddModal && (
        <div 
          id="project-creation-modal-overlay" 
          className="fixed inset-0 bg-neutral-950/65 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-fadeIn"
        >
          <div 
            id="project-creation-modal-box"
            className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-2xl max-w-md w-full relative space-y-5 animate-slideUp"
          >
            <div className="flex items-center justify-between border-b pb-3 border-neutral-100">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-neutral-900" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900 font-mono">
                  PROVISION NEW LEDGER
                </h3>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 px-2 rounded-lg hover:bg-neutral-100 text-neutral-400 hover:text-black border border-neutral-200 transition-colors cursor-pointer text-xs font-mono font-bold"
              >
                ESC
              </button>
            </div>
            
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!newProjName.trim() || !newProjLocation.trim()) return;
              
              setIsSubmitting(true);
              try {
                if (onAddProject) {
                  const created = await onAddProject({
                    name: newProjName,
                    location: newProjLocation,
                    manager: newProjManager
                  });
                  if (created) {
                    // Reset Form
                    setNewProjName("");
                    setNewProjLocation("");
                    setNewProjManager("Anand AK");
                    setShowAddModal(false);
                  }
                }
              } catch (err) {
                console.error("Ledger registration failed:", err);
              } finally {
                setIsSubmitting(false);
              }
            }} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-neutral-400 tracking-wider">
                  Project Asset Name *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-neutral-400">
                    <Building className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kozhikode Bypass Sector-C"
                    value={newProjName}
                    onChange={(e) => setNewProjName(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white rounded-xl text-xs text-neutral-800 font-medium outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-neutral-400 tracking-wider">
                  Operational Location *
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-neutral-400">
                    <MapPin className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Chainage KM-45, Kerala, India"
                    value={newProjLocation}
                    onChange={(e) => setNewProjLocation(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white rounded-xl text-xs text-neutral-800 font-medium outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-mono font-bold uppercase text-neutral-400 tracking-wider">
                  Site Manager Supervisor Name
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-3.5 text-neutral-400">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    required
                    placeholder="Anand AK"
                    value={newProjManager}
                    onChange={(e) => setNewProjManager(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white rounded-xl text-xs text-neutral-800 font-medium outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>
              
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-2xl flex gap-2 text-amber-800 text-[11px] leading-relaxed select-none">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-600 shrink-0 mt-1.5 animate-pulse" />
                <p className="font-sans">
                  <strong>Ledger Automation Hook:</strong> Upon creation, the digital validator automatically provisions compliant material passports and QC certificates.
                </p>
              </div>
              
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 border border-neutral-300 hover:bg-neutral-50 text-neutral-700 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-black hover:bg-neutral-850 text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? "Registering..." : "Register Ledger"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-neutral-950/65 backdrop-blur-md flex items-center justify-center p-4 z-[9999] animate-fadeIn">
          <div className="bg-white border border-neutral-200 rounded-3xl p-6 shadow-2xl max-w-sm w-full relative space-y-4 animate-slideUp">
            <div className="flex items-center justify-between border-b pb-2 border-neutral-100">
              <h3 className="text-xs font-mono uppercase tracking-widest text-neutral-400 font-bold">Add New User</h3>
              <button 
                onClick={() => {
                  setShowAddUserModal(false);
                  setNewUserName("");
                  setNewUserEmail("");
                  setNewUserRole("Evidence Operator");
                }} 
                className="p-1 hover:bg-neutral-100 rounded-md text-neutral-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[9px] font-mono text-neutral-400 font-bold uppercase tracking-wider mb-1">Name</label>
                <input 
                  type="text" 
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="e.g. Ethan Abraham"
                  className="w-full text-xs font-bold p-2.5 border rounded-xl focus:outline-none focus:border-black bg-neutral-50/50"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-neutral-400 font-bold uppercase tracking-wider mb-1">Email</label>
                <input 
                  type="email" 
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="e.g. ethan.abraham@constructask.dev"
                  className="w-full text-xs font-bold p-2.5 border rounded-xl focus:outline-none focus:border-black bg-neutral-50/50"
                />
              </div>
              <div>
                <label className="block text-[9px] font-mono text-neutral-400 font-bold uppercase tracking-wider mb-1">Role</label>
                <select 
                  value={newUserRole}
                  onChange={(e) => setNewUserRole(e.target.value)}
                  className="w-full text-xs font-bold p-2.5 border rounded-xl focus:outline-none focus:border-black bg-neutral-50/50 bg-white"
                >
                  <option value="Evidence Operator">Evidence Operator</option>
                  <option value="Project Manager">Project Manager</option>
                  <option value="Compliance Engineer">Compliance Engineer</option>
                  <option value="Site Engineer">Site Engineer</option>
                  <option value="QA Inspector">QA Inspector</option>
                  <option value="Auditor">Auditor</option>
                </select>
              </div>
            </div>

            <button
              onClick={async () => {
                if (!newUserName.trim() || !newUserEmail.trim()) return;
                await onAddUser({ name: newUserName, email: newUserEmail, role: newUserRole });
                setShowAddUserModal(false);
                setNewUserName("");
                setNewUserEmail("");
                setNewUserRole("Evidence Operator");
              }}
              className="w-full bg-black text-white text-xs font-bold py-3 rounded-xl hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer shadow-md"
            >
              CREATE IDENTITY
            </button>

            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-neutral-200"></div>
              <span className="text-[9px] font-mono uppercase tracking-widest text-neutral-400 font-bold">or</span>
              <div className="flex-1 h-px bg-neutral-200"></div>
            </div>

            <button
              onClick={async () => {
                if (!supabase) {
                  alert("Google sign-in is not configured. Add Supabase keys to enable it.");
                  return;
                }
                await supabase.auth.signInWithOAuth({
                  provider: "google",
                  options: { redirectTo: window.location.origin },
                });
                // Browser redirects to Google, then back to the app.
              }}
              className="w-full flex items-center justify-center gap-2.5 border border-neutral-300 rounded-xl px-4 py-3 text-xs font-bold text-neutral-800 bg-white hover:bg-neutral-50 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.57c2.08-1.92 3.27-4.74 3.27-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.76c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.36c1.62 0 3.06.56 4.21 1.66l3.16-3.16A10.96 10.96 0 0 0 12 1 11 11 0 0 0 2.18 7.05l3.66 2.84C6.71 7.29 9.14 5.36 12 5.36z" />
              </svg>
              Sign in with Google
            </button>
          </div>
        </div>
      )}
    </>
  );
}
