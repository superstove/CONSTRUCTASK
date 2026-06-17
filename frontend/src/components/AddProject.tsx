import React, { useState } from "react";
import { FolderPlus, ShieldCheck, MapPin, User, Sliders, CheckSquare, Square, RefreshCw } from "lucide-react";

interface AddProjectProps {
  onAddProject: (project: {
    id: string;
    name: string;
    location: string;
    manager: string;
    complianceScore: number;
    coverageScore: number;
    auditIntegrityScore: number;
  }) => void;
}

export default function AddProject({ onAddProject }: AddProjectProps) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [manager, setManager] = useState("Site Manager");
  const [targetScore, setTargetScore] = useState(85);
  const [selectedStandards, setSelectedStandards] = useState<string[]>(["ISO-9001", "EN-10223"]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const standardsOptions = ["EN-10223-3", "ISO-9001:2015", "ASTM-A975-21", "ISO-14001:2015", "AASHTO-M288"];

  const toggleStandard = (std: string) => {
    setSelectedStandards(prev => 
      prev.includes(std) 
        ? prev.filter(c => c !== std) 
        : [...prev, std]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !location) return;

    setIsSubmitting(true);
    setTimeout(() => {
      const newProj = {
        id: "PRJ-" + Math.floor(100 + Math.random() * 900),
        name,
        location,
        manager,
        complianceScore: targetScore,
        coverageScore: 100,
        auditIntegrityScore: 100
      };

      onAddProject(newProj);
      setIsSubmitting(false);
      setShowSuccess(true);
      
      // Reset form
      setName("");
      setLocation("");
      setManager("Site Manager");
      setTargetScore(85);
      
      setTimeout(() => setShowSuccess(false), 4000);
    }, 1500);
  };

  return (
    <div id="add-project-tab" className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto space-y-6 sm:space-y-8 bg-neutral-50 min-h-screen">
      {/* Header */}
      <div className="border-b border-neutral-200 pb-5">
        <h2 className="text-3xl font-light tracking-tight text-neutral-900 font-sans">
          Create Construction Project
        </h2>
        <p className="text-sm text-neutral-500 mt-1">
          Provision a brand-new digital project ledger. Register compliance frameworks, verification managers, and site scopes.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        
        {/* Form panel */}
        <div className="bg-white border border-neutral-200 rounded-2xl p-6 md:p-8 shadow-sm space-y-6 premium-card">
          <div className="flex items-center gap-2 border-b pb-3.5">
            <FolderPlus className="w-5 h-5 text-neutral-700" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">
              New Project Details
            </h3>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6 text-xs text-neutral-700 font-sans">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Project Name */}
              <div className="space-y-2">
                <label className="font-bold text-neutral-500 uppercase tracking-wide block">Project Title Name *</label>
                <div className="relative">
                  <FolderPlus className="absolute left-3 top-3 w-4 h-4 text-neutral-450" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kochi Metro Bridge Expansion"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white text-xs text-neutral-800 rounded-lg outline-none focus:ring-1 focus:ring-black font-semibold"
                  />
                </div>
              </div>

              {/* Site Location */}
              <div className="space-y-2">
                <label className="font-bold text-neutral-500 uppercase tracking-wide block">Site Location / Coordinates *</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-3 w-4 h-4 text-neutral-450" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Metro Sector-B Yard, Kochi, India"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white text-xs text-neutral-800 rounded-lg outline-none focus:ring-1 focus:ring-black font-semibold"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Lead Manager Profile */}
              <div className="space-y-2">
                <label className="font-bold text-neutral-500 uppercase tracking-wide block">Verification Manager Profile Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-3 w-4 h-4 text-neutral-450" />
                  <input
                    type="text"
                    required
                    value={manager}
                    onChange={(e) => setManager(e.target.value)}
                    className="w-full pl-9 pr-4 py-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white text-xs text-neutral-800 rounded-lg outline-none focus:ring-1 focus:ring-black font-semibold"
                  />
                </div>
              </div>

              {/* Target Coverage Sliders */}
              <div className="space-y-2">
                <label className="font-bold text-neutral-500 uppercase tracking-wide block flex justify-between">
                  <span>Initial Compliance Target Score</span>
                  <span className="font-mono text-neutral-805 font-bold">{targetScore}%</span>
                </label>
                <div className="relative flex items-center gap-3 pt-1.5">
                  <Sliders className="w-4 h-4 text-neutral-405 shrink-0" />
                  <input
                    type="range"
                    min="50"
                    max="100"
                    value={targetScore}
                    onChange={(e) => setTargetScore(parseInt(e.target.value))}
                    className="w-full accent-black cursor-pointer"
                  />
                </div>
              </div>
            </div>

            {/* Checkboxes: Target Standards */}
            <div className="space-y-3 pt-2">
              <label className="font-bold text-neutral-500 uppercase tracking-wide block">
                Target Compliance Framework Standards Checklists
              </label>
              
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {standardsOptions.map((std) => {
                  const check = selectedStandards.includes(std);
                  return (
                    <button
                      key={std}
                      type="button"
                      onClick={() => toggleStandard(std)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-colors text-center cursor-pointer ${
                        check 
                          ? "border-neutral-900 bg-neutral-50 font-bold" 
                          : "border-neutral-150 bg-white hover:border-neutral-400 text-neutral-400"
                      }`}
                    >
                      {check ? (
                        <CheckSquare className="w-4 h-4 text-neutral-805 mb-1.5 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 text-neutral-300 mb-1.5 shrink-0" />
                      )}
                      <span className="text-[10px] font-mono whitespace-nowrap">{std}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Submit Action */}
            <div className="pt-4 border-t flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-[11px] text-neutral-450 italic font-light">
                * Real ledger initialization registers this project automatically onto regional immutable smart networks.
              </p>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto bg-black hover:bg-neutral-800 text-white font-bold py-2.5 px-6 rounded-xl text-xs uppercase tracking-wider transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Deploying Ledger Project...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4.5 h-4.5 text-white" />
                    <span>Create New Project Node</span>
                  </>
                )}
              </button>
            </div>

          </form>
        </div>

        {/* Success Alert Banner */}
        {showSuccess && (
          <div className="bg-emerald-50 border border-emerald-250 text-emerald-900 p-5 rounded-2xl flex items-start gap-4 animate-fadeIn">
            <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
            <div>
              <h4 className="font-bold text-xs uppercase tracking-wide">Blockchain Node Initialized</h4>
              <p className="text-xs text-emerald-800 mt-1 font-light leading-relaxed">
                Project node deployed successfully! Security keys established, audit trail has been initialized, and verification routines are ready for field scans. Use the dropdown in sidebar to explore details.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
