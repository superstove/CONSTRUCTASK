import { AuditBlock, ComplianceCertificate, ProductPassport, Project } from "../types";
import { ScanLogItem } from "../components/ScanLog";

type FrontendProjectOption = {
  id: string;
  name: string;
  location: string;
  manager: string;
  risk: "HIGH" | "LOW";
};

type FastApiProject = {
  id: number;
  name: string;
  location: string;
  start_date: string;
  end_date: string;
  status: string;
  risk_score: string;
};

type FastApiMaterial = {
  id: number;
  project_id: number;
  name: string;
  supplier: string;
  batch_number: string;
  qr_code: string;
  status: string;
  quantity: number;
  unit: string;
};

type FastApiPassport = {
  id: number;
  material_id: number;
  passport_number: string;
  passport_id: string | null;
  compliance_score: number;
  carbon_score: number;
  sustainability_score: number | null;
  carbon_footprint: number | null;
  status: string;
};

type FastApiCertificate = {
  id: number;
  material_id: number;
  certificate_name: string;
  issuing_body: string;
  issue_date: string;
  expiry_date: string;
  status: string;
  material_name?: string;
  days_until_expiry?: number;
};

type FastApiApproval = {
  id: number;
  project_id: number;
  material_id: number;
  approval_type: string;
  approver: string;
  status: string;
  requested_date: string;
  approved_date: string | null;
  overdue_days: number;
  material_name: string;
};

export type FrontendApproval = FastApiApproval;

type FastApiScan = {
  id: number;
  material_id: number;
  project_id: number;
  scanned_by: string;
  scan_time: string;
  location: string;
  scan_type: string;
  result: string;
  material_name: string;
};

type FastApiDashboard = {
  project: FastApiProject;
  total_materials: number;
  pending_approvals: number;
  expiring_certs: number;
  total_deliveries: number;
  ontime_deliveries: number;
  delayed_deliveries: number;
  alerts: string[];
  reasoning_sources: string[];
  workflow_dependencies: string[];
  health_timeline: string[];
  activity_timeline: Array<{
    id: string;
    date: string;
    title: string;
    description: string;
    category: string;
    status: string;
    tone: string;
  }>;
  executive_brief: string[];
  risk_confidence: string;
  supplier_risks: Array<{
    supplier: string;
    risk: string;
    reason: string;
    delayed_deliveries: number;
    total_delay_days: number;
    total_deliveries: number;
    ontime_deliveries: number;
  }>;
};

type FastApiReadiness = {
  status: string;
  score: number;
  blockers: number;
  warnings: number;
  reasons: string[];
  next_action: string;
};

type FastApiAction = {
  id: string;
  rank: number;
  severity: string;
  category: string;
  material_name: string;
  issue: string;
  action: string;
  owner: string;
};

type FastApiProjectBundle = {
  project: FastApiProject;
  dashboard: FastApiDashboard;
  readiness: FastApiReadiness;
  actions: FastApiAction[];
  materials: FastApiMaterial[];
  certificates: FastApiCertificate[];
  approvals: FastApiApproval[];
  scans: FastApiScan[];
  passports: FastApiPassport[];
  audit_trail: any[];
};

export const API_BASE_URL =
  ((import.meta as any).env?.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") ||
  "http://127.0.0.1:8000";

let cachedToken: string | null = null;
let tokenRequest: Promise<string> | null = null;

const APP_TOKEN_KEY = "constructask_app_token";
const APP_USER_KEY = "constructask_app_user";

export function getStoredAppToken(): string | null {
  return localStorage.getItem(APP_TOKEN_KEY);
}

export function getStoredAppUser(): { user_id: number; name: string; role: string } | null {
  const raw = localStorage.getItem(APP_USER_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearAppSession(): void {
  localStorage.removeItem(APP_TOKEN_KEY);
  localStorage.removeItem(APP_USER_KEY);
  cachedToken = null;
  tokenRequest = null;
}

export async function verifyStoredAppSession(): Promise<boolean> {
  const token = getStoredAppToken();
  if (!token) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      cachedToken = token;
      return true;
    }
  } catch (err) {
    console.error("Stored session validation failed", err);
  }

  clearAppSession();
  return false;
}

/** Exchange a Supabase (Google) session token for this app's own JWT. */
export async function exchangeGoogleSession(supabaseAccessToken: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/google-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: supabaseAccessToken }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google sign-in failed ${response.status}: ${body}`);
  }
  const data = await response.json();
  localStorage.setItem(APP_TOKEN_KEY, data.access_token);
  localStorage.setItem(APP_USER_KEY, JSON.stringify({ user_id: data.user_id, name: data.name, role: data.role }));
  cachedToken = data.access_token;
  return data as { access_token: string; user_id: number; name: string; role: string };
}

export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const stored = getStoredAppToken();
  if (stored) {
    cachedToken = stored;
    return stored;
  }
  if (tokenRequest) return tokenRequest;
  // Demo auto-login is available only after the user explicitly chooses the demo account.
  if (localStorage.getItem("constructask_demo") !== "1") return "";

  tokenRequest = (async () => {
    try {
      const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: (import.meta as any).env?.VITE_DEMO_EMAIL || "demo@constructask.dev",
          password: (import.meta as any).env?.VITE_DEMO_PASSWORD || "demo1234",
        }),
      });
      if (loginResponse.ok) {
        const data = await loginResponse.json();
        cachedToken = data.access_token;
        return cachedToken || "";
      }
    } catch (err) {
      console.error("Auto-login failed", err);
    } finally {
      tokenRequest = null;
    }
    return "";
  })();

  return tokenRequest;
}

/** Download the server-generated enterprise PDF using the app's auth token. */
export async function downloadProjectReportPdf(projectId: string | number): Promise<void> {
  const token = await getAuthToken();
  const id = numericId(projectId);
  const response = await fetch(`${API_BASE_URL}/api/projects/${id}/report.pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PDF request failed ${response.status}: ${body.slice(0, 200)}`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Construct Ask_Report_${id}_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options?.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401 && getStoredAppToken()) {
      // Stored Google-session token expired — clear it so the next load re-authenticates.
      clearAppSession();
    }
    const body = await response.text();
    throw new Error(`Backend request failed ${response.status}: ${body || response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function numericId(id: string | number): number {
  const parsed = Number(String(id).replace(/[^\d]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function titleStatus(status: string): ComplianceCertificate["status"] {
  const normalized = status.toLowerCase();
  if (normalized === "valid" || normalized === "active") return "Active";
  if (normalized === "expiring") return "Expiring";
  if (normalized === "revoked") return "Revoked";
  return "Expired";
}

function stageFromMaterialStatus(status: string): ProductPassport["currentStage"] {
  const normalized = status.toLowerCase();
  if (normalized === "verified") return "Verified";
  if (normalized === "failed") return "Delivered";
  if (normalized === "pending") return "Delivered";
  return "Certified";
}

export function mapProjectOption(project: FastApiProject): FrontendProjectOption {
  return {
    id: String(project.id),
    name: project.name,
    location: project.location,
    manager: "Site Manager",
    risk: project.risk_score.toLowerCase() === "high" ? "HIGH" : "LOW",
  };
}

export function mapCertificate(certificate: FastApiCertificate): ComplianceCertificate {
  return {
    id: String(certificate.id),
    name: certificate.certificate_name,
    issuer: certificate.issuing_body,
    issuedAt: certificate.issue_date,
    expiresAt: certificate.expiry_date,
    status: titleStatus(certificate.status),
    documentUrl: "#",
    scope: certificate.material_name || `Material ${certificate.material_id}`,
    materialId: String(certificate.material_id),
  };
}

export function mapScanLog(scan: FastApiScan): ScanLogItem {
  const verified = ["passed", "approved_for_site_use", "verified", "success"].some((token) =>
    scan.result.toLowerCase().includes(token)
  );

  return {
    id: String(scan.id),
    timestamp: scan.scan_time,
    scannedBy: scan.scanned_by,
    productName: scan.material_name,
    productCode: `MAT-${scan.material_id}`,
    qrPayload: `constructask://material/${scan.material_id}/scan/${scan.id}`,
    location: scan.location,
    status: verified ? "Verified" : "Flagged",
    details: `${scan.scan_type.replace(/_/g, " ")} result: ${scan.result.replace(/_/g, " ")}.`,
  };
}

export function mapMaterialToPassport(
  material: FastApiMaterial,
  project: Pick<FastApiProject, "name" | "location">,
  certificates: Array<Pick<FastApiCertificate, "material_id" | "certificate_name">>,
  materialAuditBlocks: AuditBlock[],
  apiPassport?: FastApiPassport
): ProductPassport {
  const linkedCertificates = certificates.filter((certificate) => certificate.material_id === material.id);
  const standards = linkedCertificates.map((certificate) => certificate.certificate_name);

  // Use REAL database values only (no invented numbers, no status-inference).
  // The passport metrics come straight from the product_passports table.
  const sustainabilityScore = apiPassport?.sustainability_score ?? null;
  const carbonEmissions = apiPassport?.carbon_footprint ?? null;

  // Carbon band is DERIVED from the real footprint number, not from status.
  const carbonFootprint =
    carbonEmissions === null ? "Pending"
    : carbonEmissions <= 1.5 ? "Low"
    : carbonEmissions <= 3.0 ? "Medium"
    : "High";

  // Compliance grade is DERIVED from the real compliance_score, not from status.
  const complianceRating =
    !apiPassport ? "Pending"
    : apiPassport.compliance_score >= 85 ? "A"
    : apiPassport.compliance_score >= 70 ? "B"
    : "C";

  return {
    id: String(material.id),
    name: material.name,
    code: material.batch_number,
    origin: project.location,
    manufacturer: material.supplier,
    composition: `${material.quantity} ${material.unit} registered for ${project.name}.`,
    sustainabilityScore,
    carbonFootprint,
    carbonEmissions,
    complianceRating,
    standards: standards.length ? standards : ["Project material evidence"],
    currentStage: stageFromMaterialStatus(material.status),
    verifier: "Construct Ask Backend",
    qrPayload: material.qr_code,
    auditChain: materialAuditBlocks,
  };
}


function buildDashboardData(
  materials: FastApiMaterial[],
  certificates: FastApiCertificate[],
  approvals: FastApiApproval[],
  scans: FastApiScan[],
  dashboard: FastApiDashboard
) {
  const verifiedMaterials = materials.filter((material) => material.status === "verified").length;
  const approvedApprovals = approvals.filter((approval) => approval.status === "approved").length;
  const validCerts = certificates.filter((certificate) => certificate.status === "valid").length;
  const expiringCerts = certificates.filter((certificate) => certificate.status === "expiring").length;
  const expiredCerts = certificates.filter((certificate) => certificate.status === "expired").length;
  const verifiedScans = scans.filter((scan) => mapScanLog(scan).status === "Verified").length;

  return {
    dashboardData: {
      approvals_total: approvals.length,
      approvals_approved: approvedApprovals,
      approvals_pending: approvals.length - approvedApprovals,
      deliveries_total: dashboard.total_deliveries,
      deliveries_ontime: dashboard.ontime_deliveries,
      deliveries_delayed: dashboard.delayed_deliveries,
    },
    materialsData: {
      total: materials.length,
      verified: verifiedMaterials,
      materials,
    },
    certificatesData: {
      valid: validCerts,
      expiring: expiringCerts,
      expired: expiredCerts,
      certificates,
    },
    scansData: {
      total_scans: scans.length,
      verified_scans: verifiedScans,
      logs: scans.map(mapScanLog),
      last_hash: "backend-driven",
    },
  };
}

function buildRisks(actions: FastApiAction[]) {
  return actions.map((action) => ({
    id: action.id,
    title: action.issue,
    material: action.material_name,
    severity: action.severity,
    owner: action.owner,
    action: action.action,
  }));
}

function buildIntelligence(
  dashboard: FastApiDashboard,
  readiness: FastApiReadiness,
  actions: FastApiAction[],
  materials: FastApiMaterial[],
  certificates: FastApiCertificate[],
  scans: FastApiScan[]
) {
  const dependencyChains = dashboard.workflow_dependencies
    // Drop the backend's "no active blockers" placeholder — handled as an empty state in the UI.
    .filter((dependency) => !/^no active blockers/i.test(dependency))
    .map((dependency) => {
      // Backend format is always "rootCause -> effect -> impact" (2 or 3 segments).
      const parts = dependency.split("->").map((part) => part.trim()).filter(Boolean);
      if (parts.length >= 3) {
        return { rootCause: parts[0], effect: parts[1], impact: parts.slice(2).join(" — ") };
      }
      if (parts.length === 2) {
        return { rootCause: parts[0], effect: null as string | null, impact: parts[1] };
      }
      return { rootCause: parts[0] || "Project workflow", effect: null as string | null, impact: readiness.next_action };
    });

  return {
    dependencyEngine: dependencyChains,
    materialReleaseEngine: materials.map((material) => {
      const materialCerts = certificates.filter((certificate) => certificate.material_id === material.id);
      const materialScans = scans.filter((scan) => scan.material_id === material.id);
      const hasBadCert = materialCerts.some((certificate) => certificate.status === "expired");
      const hasValidCert = materialCerts.some((certificate) => certificate.status === "valid" || certificate.status === "expiring");
      const hasPassedScan = materialScans.some((scan) => mapScanLog(scan).status === "Verified");
      const materialActions = actions.filter((action) => action.material_name === material.name);
      const hasApprovalAction = materialActions.some((action) => action.category === "Approval");
      const hasDeliveryAction = materialActions.some((action) => action.category === "Delivery");
      const hasBlockingAction = materialActions.some((action) => action.severity === "Blocker");
      const isReady = material.status === "verified" && hasValidCert && !hasBadCert && !hasApprovalAction && !hasDeliveryAction && !hasBlockingAction && hasPassedScan;
      return {
        id: String(material.id),
        name: material.name,
        decision: isReady ? "READY FROM RECORDS" : hasBlockingAction || hasBadCert || material.status === "failed" ? "BLOCKED" : "HOLD",
        checks: {
          certificates: !hasBadCert && hasValidCert,
          approvals: !hasApprovalAction,
          compliance: material.status !== "failed",
          delivery: !hasDeliveryAction,
          qrScans: hasPassedScan,
        },
      };
    }),
    risks: actions.map((action) => ({
      id: action.id,
      name: action.issue,
      // Derived from the backend's weighted priority ranking (rank 1 = most urgent),
      // with blockers floored above warnings. No fabricated constants.
      score: Math.max(
        action.severity === "Blocker" ? 75 : 40,
        100 - (action.rank - 1) * 8
      ),
      critical: action.severity === "Blocker",
      category: action.category,
      action: action.action,
    })),
    supplierPerformance: dashboard.supplier_risks.map((supplier) => ({
      name: supplier.supplier,
      // Real on-time rate from delivery records, or null when the supplier has no deliveries yet.
      reliability: supplier.total_deliveries > 0
        ? Math.round((supplier.ontime_deliveries / supplier.total_deliveries) * 100)
        : null,
      delays: supplier.delayed_deliveries,
      risk: supplier.risk,
      reason: supplier.reason,
      totalDelayDays: supplier.total_delay_days,
      totalDeliveries: supplier.total_deliveries,
      ontimeDeliveries: supplier.ontime_deliveries,
    })),
    deliveryIntelligence: {
      total: dashboard.total_deliveries,
      onTime: dashboard.ontime_deliveries,
      delayed: dashboard.delayed_deliveries,
      delayedActions: actions.filter((action) => action.category === "Delivery"),
    },
    readiness,
  };
}

export async function listProjects(): Promise<FrontendProjectOption[]> {
  const projects = await apiFetch<FastApiProject[]>("/api/projects/");
  return projects.map(mapProjectOption);
}

export async function createProject(input: { name: string; location: string; manager?: string }) {
  const today = new Date();
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + 180);

  const project = await apiFetch<FastApiProject>("/api/projects/", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      location: input.location,
      start_date: today.toISOString().slice(0, 10),
      end_date: endDate.toISOString().slice(0, 10),
      status: "Active",
      risk_score: "Medium",
    }),
  });

  return mapProjectOption(project);
}

export async function getProjectBundle(projectId: string | number) {
  const id = numericId(projectId);
  const {
    project,
    dashboard,
    readiness,
    actions,
    materials,
    certificates,
    approvals,
    scans,
    passports: apiPassports,
    audit_trail: apiAuditTrails,
  } = await apiFetch<FastApiProjectBundle>(`/api/projects/${id}/bundle`);

  const mappedCertificates = certificates.map(mapCertificate);
  
  // Sort from oldest to newest to compute the block index accurately
  const backendAuditTrail = (apiAuditTrails || []).slice().sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  
  const mappedAuditBlocks = backendAuditTrail.map((trail, idx) => {
    const mat = materials.find((m) => m.id === trail.material_id);
    return {
      index: idx,
      timestamp: trail.timestamp,
      action: trail.action,
      operator: trail.performed_by,
      status: (trail.result || "").toLowerCase().includes("fail") || (trail.result || "").toLowerCase().includes("block") ? "Flagged" : "Success",
      details: trail.details,
      previousHash: trail.previous_hash || "GENESIS",
      hash: trail.hash || "GENESIS",
      passportId: String(trail.material_id),
      passportName: mat?.name || "Unknown Material",
      passportCode: mat?.batch_number || "Unknown Batch",
    } as AuditBlock;
  });

  const passports = materials.map((material) => {
    const p = apiPassports.find(ap => ap.material_id === material.id);
    const materialAuditBlocks = mappedAuditBlocks.filter((bk) => bk.passportId === String(material.id));
    return mapMaterialToPassport(material, project, certificates, materialAuditBlocks, p);
  });
  
  const auditTrail = mappedAuditBlocks.slice().reverse(); // Show newest first globally

  const { dashboardData, materialsData, certificatesData, scansData } = buildDashboardData(
    materials,
    certificates,
    approvals,
    scans,
    dashboard
  );

  const projectModel: Project = {
    id: String(project.id),
    name: project.name,
    location: project.location,
    status: project.status === "Active" ? "In Progress" : "Completed",
    manager: "Site Manager",
    complianceScore: readiness.score,
    coverageScore: materials.length ? Math.round((materialsData.verified / materials.length) * 100) : 0,
    auditIntegrityScore: scans.length ? Math.round((scansData.verified_scans / scans.length) * 100) : 100,
    passports,
    certificates: mappedCertificates,
    globalAuditLogsCount: auditTrail.length,
  };

  return {
    project: projectModel,
    passports,
    certificates: mappedCertificates,
    approvalsData: approvals,
    auditTrail,
    dashboardData,
    executiveSummary: {
      risk_level: dashboard.project.risk_score.toUpperCase(),
      summary: dashboard.executive_brief.join(" "),
      brief_items: dashboard.executive_brief,
      readiness,
    },
    materialsData,
    certificatesData,
    scansData,
    risksList: buildRisks(actions),
    intelligenceData: buildIntelligence(dashboard, readiness, actions, materials, certificates, scans),
  };
}

export type AssistantChart = {
  type: "bar";
  title: string;
  items: Array<{ label: string; value: number; tone?: "good" | "warn" | "bad"; suffix?: string }>;
};

export type AssistantReply = {
  answer: string;
  followUps: string[];
  chart: AssistantChart | null;
};

export async function askAssistant(
  question: string,
  projectId: string | number,
  userId?: number,
  role?: string
): Promise<AssistantReply> {
  const result = await apiFetch<{
    answer: string;
    data_used: string[];
    mode: string;
    reasoning_sources: string[];
    confidence: string;
    follow_up_suggestions?: string[];
    chart?: AssistantChart | null;
  }>("/api/chat/", {
    method: "POST",
    body: JSON.stringify({
      question,
      project_id: numericId(projectId),
      ...(userId != null ? { user_id: userId } : {}),
      ...(role ? { role } : {}),
    }),
  });
  const confidence = result.confidence || "Medium";
  const confidenceEmoji = confidence.toLowerCase() === "high" ? "✅" : confidence.toLowerCase() === "medium" ? "🟡" : "🔴";
  return {
    answer: `${result.answer}\n\n${confidenceEmoji} Answer based on your project's live data · ${confidence} confidence`,
    followUps: result.follow_up_suggestions || [],
    chart: result.chart || null,
  };
}

export type DppVerification = {
  verdict: "AUTHENTIC" | "TAMPERED" | "UNTRUSTED_ISSUER";
  reason: string;
  signature_ok: boolean;
  issuer_trusted: boolean;
  issuer_name: string;
  issuer_id: string;
  key_fingerprint: string;
  signature_preview: string;
  algorithm: string;
  issued_at: string | null;
  freshly_issued: boolean;
  signed_fields: Record<string, unknown>;
};

/** Cryptographically verify a material's Digital Product Passport signature. */
export async function verifyDppMaterial(materialId: number | string): Promise<DppVerification> {
  return apiFetch<DppVerification>("/api/dpp/verify-material", {
    method: "POST",
    body: JSON.stringify({ material_id: Number(materialId) }),
  });
}

/**
 * Public (no-login) DPP verification — used by the public /?verify=<id> page.
 * Hits the same PUBLIC backend endpoint but WITHOUT an auth token, so anyone
 * who scans a QR can verify a material's authenticity.
 */
export async function verifyDppMaterialPublic(materialId: number | string): Promise<DppVerification> {
  const response = await fetch(`${API_BASE_URL}/api/dpp/verify-material`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ material_id: Number(materialId) }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Verification failed (${response.status}): ${body || response.statusText}`);
  }
  return response.json() as Promise<DppVerification>;
}

/** URL of the scannable QR PNG for a material (encodes the public verify-page link). */
export function dppQrPngUrl(materialId: number | string): string {
  return `${API_BASE_URL}/api/dpp/qr/${Number(materialId)}.png`;
}

export async function verifyMaterialRelease(input: {
  projectId: string | number;
  qrCode: string;
  scannedBy: string;
  location: string;
}) {
  const params = new URLSearchParams({
    project_id: String(numericId(input.projectId)),
    qr_code: input.qrCode,
    scanned_by: input.scannedBy,
    location: input.location,
  });
  return apiFetch<{
    decision: string;
    material: string | null;
    batch_number: string | null;
    supplier: string | null;
    qr_code?: string;
    reasons: string[];
    checks?: Array<{ label: string; status: string; detail: string }>;
  }>(`/api/materials/verify?${params.toString()}`, {
    method: "POST",
  });
}

export async function updateApproval(id: number, status: "approved" | "rejected" | "pending"): Promise<FrontendApproval> {
  return apiFetch<FrontendApproval>(`/api/approvals/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function updateMaterialStage(materialId: number, newStage: string): Promise<FastApiMaterial> {
  return apiFetch<FastApiMaterial>(`/api/materials/${materialId}/stage`, {
    method: "PUT",
    body: JSON.stringify({ new_stage: newStage }),
  });
}

export async function createMaterial(material: {
  project_id: number;
  name: string;
  batch_id: string;
  supplier: string;
  category?: string;
}): Promise<FastApiMaterial> {
  return apiFetch<FastApiMaterial>("/api/materials/", {
    method: "POST",
    body: JSON.stringify(material),
  });
}

export async function fetchAuditTrail(projectId: number | string): Promise<Array<{
  id: number;
  action: string;
  performed_by: string;
  timestamp: string;
  details: string;
}>> {
  return apiFetch(`/api/projects/${numericId(projectId)}/audit-trail`);
}

export async function updateSustainabilityMetrics(
  materialId: number | string,
  payload: { carbon_footprint: number; sustainability_score: number }
): Promise<FastApiPassport> {
  return apiFetch<FastApiPassport>(`/api/passports/material/${materialId}/sustainability`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type FrontendUser = {
  id: number;
  name: string;
  email: string;
  role: string;
};

export async function listUsers(): Promise<FrontendUser[]> {
  return apiFetch<FrontendUser[]>("/api/users/");
}

export async function createUser(user: { name: string; email: string; role: string }): Promise<FrontendUser> {
  return apiFetch<FrontendUser>("/api/users/", {
    method: "POST",
    body: JSON.stringify(user),
  });
}

export async function updateUser(id: number, user: { name: string; email: string; role: string }): Promise<FrontendUser> {
  return apiFetch<FrontendUser>(`/api/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(user),
  });
}

export async function deleteUser(id: number): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/api/users/${id}`, {
    method: "DELETE",
  });
}
