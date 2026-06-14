export interface AuditBlock {
  index: number;
  timestamp: string;
  action: string;
  operator: string;
  status: "Success" | "Flagged" | "Pending";
  details: string;
  previousHash: string;
  hash: string;
  passportId?: string;
  passportName?: string;
  passportCode?: string;
}

export interface ComplianceCertificate {
  id: string;
  name: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  status: "Active" | "Expiring" | "Expired" | "Revoked";
  documentUrl: string;
  scope: string;
}

export interface ProductPassport {
  id: string;
  name: string;
  code: string;
  origin: string;
  manufacturer: string;
  composition: string;
  sustainabilityScore: number | null;
  carbonFootprint: "Low" | "Medium" | "High" | string;
  carbonEmissions: number | null;
  complianceRating: string;
  standards: string[];
  currentStage: "Manufactured" | "Certified" | "Delivered" | "Approved" | "Installed" | "Verified" | "Audited";
  verifier: string;
  qrPayload: string;
  auditChain: AuditBlock[];
}

export interface Project {
  id: string;
  name: string;
  location: string;
  status: "In Progress" | "Completed" | "Audit Warning";
  manager: string;
  complianceScore: number;
  coverageScore: number;
  auditIntegrityScore: number;
  passports: ProductPassport[];
  certificates: ComplianceCertificate[];
  globalAuditLogsCount: number;
}

export type VisualTheme = "light" | "sand" | "nordic" | "cosmic";

export interface DashboardMetrics {
  project_readiness: number;
  material_readiness: number;
  compliance_readiness: number;
  approval_readiness: number;
  delivery_readiness: number;
  risk_level: "High" | "Medium" | "Low" | string;
  expired_certificates: number;
  overdue_approvals: number;
  delayed_deliveries: number;
  raw_facts: {
    materials_total: number;
    materials_verified: number;
    certificates_total: number;
    certificates_valid: number;
    approvals_total: number;
    approvals_approved: number;
    deliveries_total: number;
    deliveries_ontime: number;
  };
}

