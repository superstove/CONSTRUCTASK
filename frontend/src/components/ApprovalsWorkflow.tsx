import React, { useState } from "react";
import { AlertCircle, User, Calendar, ShieldCheck, CheckCircle2, Clock, Check, RefreshCw } from "lucide-react";

export interface ApprovalGate {
  id: string;
  name: string;
  material: string;
  assignee: string;
  dueDate: string;
  overdueDays: number;
  priority: "High Blocker" | "Medium Risk" | "Low";
  status: "Overdue" | "Pending" | "Signed-off";
  signedOffBy?: string;
  signedOffAt?: string;
  comments?: string;
}

interface ApprovalsWorkflowProps {
  onRefresh: () => void;
  onGateApproved: (gateId: string) => void;
  gates: ApprovalGate[];
  setGates: React.Dispatch<React.SetStateAction<ApprovalGate[]>>;
}

export default function ApprovalsWorkflow({ onRefresh, onGateApproved, gates, setGates }: ApprovalsWorkflowProps) {
  const [selectedGate, setSelectedGate] = useState<ApprovalGate | null>(null);
  const [signOffComments, setSignOffComments] = useState("");
  const [signOffOperator, setSignOffOperator] = useState("Anand AK");
  const [isSigning, setIsSigning] = useState(false);

  const handleSignOffSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGate) return;

    setIsSigning(true);
    setTimeout(() => {
      // Complete signature
      const updated = gates.map(g => {
        if (g.id === selectedGate.id) {
          return {
            ...g,
            status: "Signed-off" as const,
            signedOffBy: signOffOperator,
            signedOffAt: new Date().toISOString(),
            comments: signOffComments || "Manual sign-off complete. Certs validated."
          };
        }
        return g;
      });
      setGates(updated);
      onGateApproved(selectedGate.id);
      
      setIsSigning(false);
      setSelectedGate(null);
      setSignOffComments("");
    }, 1000);
  };

  const overdueGates = gates.filter(g => g.status === "Overdue");
  const pendingGates = gates.filter(g => g.status === "Pending");
  const signedOffGates = gates.filter(g => g.status === "Signed-off");

  return (
    <div id="approvals-tab" className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 bg-neutral-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between border-b pb-5 gap-4">
        <div>
          <h2 className="text-3xl font-light tracking-tight text-neutral-900 font-sans">
            Approvals & Workflow Gates
          </h2>
          <p className="text-sm text-neutral-500 mt-1">
            Resolve critical construction design milestones, sign off on supervisor approvals, and clear schedule blockers.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] bg-red-50 border border-red-100 py-1.5 px-3 rounded-lg text-red-800 font-mono shadow-sm self-start sm:self-auto font-bold">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <span>{overdueGates.length} Critical Gates Overdue</span>
        </div>
      </div>

      {/* Overdue Gates High-Visual Row */}
      {overdueGates.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">
            Active Workflow Blockers
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {overdueGates.map((gate) => (
              <div 
                key={gate.id} 
                id={`overdue-gate-box-${gate.id}`} 
                className="bg-neutral-900 text-white rounded-2xl p-5 border border-neutral-850 shadow-md relative overflow-hidden flex flex-col justify-between"
              >
                <div className="absolute top-0 left-0 right-0 h-[4px] bg-red-500" />
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-[10px] font-mono font-bold uppercase">
                    <span className="text-red-400 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> OVERDUE {gate.overdueDays} DAYS
                    </span>
                    <span className="text-neutral-450 border border-neutral-800 px-1.5 py-0.5 rounded">
                      {gate.priority}
                    </span>
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-neutral-100">{gate.name}</h4>
                    <p className="text-xs text-neutral-400 leading-snug mt-1 font-light">
                      Required for <strong className="text-neutral-200">{gate.material}</strong> release in Sector-3.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-xs bg-neutral-950 p-3 rounded-xl border border-neutral-850/60 font-mono text-neutral-400">
                    <div>
                      <span>Responsible:</span>
                      <p className="text-neutral-200 font-bold font-sans mt-0.5 flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-neutral-400" /> {gate.assignee}
                      </p>
                    </div>
                    <div>
                      <span>Due Date:</span>
                      <p className="text-neutral-200 font-bold mt-0.5">{new Date(gate.dueDate).toLocaleDateString()}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-neutral-800/80 flex justify-end">
                  <button
                    onClick={() => setSelectedGate(gate)}
                    className="bg-red-650 hover:bg-red-700 text-white font-bold py-1.5 px-3.5 rounded-lg text-xs uppercase tracking-wider transition-colors cursor-pointer"
                  >
                    Resolve & Sign-off
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Approvals Grid Table */}
      <div className="bg-white border border-neutral-200 rounded-2xl shadow-sm overflow-hidden flex flex-col premium-card">
        <div className="px-6 py-4 border-b border-neutral-100 bg-neutral-50/50 flex justify-between items-center text-xs font-bold uppercase tracking-widest text-neutral-400">
          <span>Complete Approval Register</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs min-w-[600px]" id="approvals-register-table">
            <thead>
              <tr className="bg-neutral-50 border-b text-neutral-500 font-bold uppercase tracking-wider text-[9.5px]">
                <th className="py-3.5 px-6">Gate / Step Designation</th>
                <th className="py-3.5 px-4">Monitored Material</th>
                <th className="py-3.5 px-4">Responsible Practitioner</th>
                <th className="py-3.5 px-4 font-mono">Target Date</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-sans">
              {gates.map((g) => {
                const isOverdue = g.status === "Overdue";
                const isSigned = g.status === "Signed-off";
                return (
                  <tr key={g.id} className="hover:bg-neutral-50/20 transition-colors">
                    <td className="py-4 px-6">
                      <div className="font-bold text-neutral-850 text-xs">{g.name}</div>
                      <span className="text-[9px] font-mono text-neutral-400 bg-neutral-50 py-0.5 px-1 rounded inline-block mt-1 font-bold">
                        ID: {g.id}
                      </span>
                    </td>
                    <td className="py-4 px-4 text-neutral-700 font-semibold">
                      {g.material}
                    </td>
                    <td className="py-4 px-4 font-medium text-neutral-600 flex items-center gap-1.5 pt-5">
                      <User className="w-3.5 h-3.5 text-neutral-405" /> {g.assignee}
                    </td>
                    <td className="py-4 px-4 font-mono text-[10.5px] text-neutral-550">
                      {new Date(g.dueDate).toLocaleDateString()}
                    </td>
                    <td className="py-4 px-4 text-center">
                      <span className={`inline-block font-mono text-[9px] py-0.5 px-2 rounded-full font-bold uppercase border ${
                        isSigned 
                          ? "bg-emerald-100 border-emerald-200 text-emerald-800" 
                          : isOverdue 
                            ? "bg-red-100 border-red-200 text-red-800 font-bold text-red-900" 
                            : "bg-neutral-100 border-neutral-200 text-neutral-600"
                      }`}>
                        {g.status}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      {isSigned ? (
                        <div className="text-[10px] text-emerald-700 font-sans font-bold flex items-center gap-1 justify-end">
                          <Check className="w-3.5 h-3.5" /> SECURE SIGNED
                        </div>
                      ) : (
                        <button
                          onClick={() => setSelectedGate(g)}
                          className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold py-1 px-3 rounded-md text-[10px] uppercase font-mono tracking-wider cursor-pointer"
                        >
                          Sign-off
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Signature Resolution Overlay Dialog Modal */}
      {selectedGate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4 transition-all">
          <div className="bg-white border border-neutral-250 rounded-2xl p-6 md:p-8 max-w-lg w-full shadow-2xl relative space-y-6 animate-fadeIn">
            <div className="border-b pb-4">
              <h3 className="text-lg font-bold text-neutral-900">Resolve Workflow Milestone Gate</h3>
              <p className="text-xs text-neutral-500 mt-1">
                You are about to cryptographically sign off on <strong>{selectedGate.name}</strong> as an authorized civil engineer.
              </p>
            </div>

            <form onSubmit={handleSignOffSubmit} className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-neutral-400 font-mono block">Milestone</label>
                  <p className="font-bold text-neutral-800 bg-neutral-50 p-2.5 rounded-lg border">{selectedGate.name}</p>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold uppercase text-neutral-400 font-mono block">Component Affected</label>
                  <p className="font-bold text-neutral-800 bg-neutral-50 p-2.5 rounded-lg border">{selectedGate.material}</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-neutral-400 font-mono block">Signature Practitioner Signee Name</label>
                <input 
                  type="text" 
                  required
                  value={signOffOperator}
                  onChange={(e) => setSignOffOperator(e.target.value)}
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white rounded-lg focus:ring-1 focus:ring-black outline-none font-bold text-neutral-800 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase text-neutral-400 font-mono block">Supervisor Remarks / Reconcilation Statement(s)</label>
                <textarea 
                  rows={3}
                  required
                  placeholder="Insert field testing comments, standards compliance confirmation, and physical verification proofs..."
                  value={signOffComments}
                  onChange={(e) => setSignOffComments(e.target.value)}
                  className="w-full p-2.5 bg-neutral-50 border border-neutral-200 focus:bg-white rounded-lg focus:ring-1 focus:ring-black outline-none text-neutral-800 text-xs"
                />
              </div>

              {/* Action Submit */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedGate(null)}
                  className="bg-white hover:bg-neutral-50 border border-neutral-300 text-neutral-700 font-bold py-2 px-4 rounded-xl cursor-pointer uppercase text-[10px] font-mono tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSigning}
                  className="bg-neutral-900 hover:bg-neutral-800 text-white font-bold py-2 px-5 rounded-xl cursor-pointer disabled:opacity-50 flex items-center gap-1.5 uppercase text-[10px] font-mono tracking-wider"
                >
                  {isSigning ? (
                    <>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      <span>Writing...</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-white" />
                      <span>Authorize Sign-off</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
