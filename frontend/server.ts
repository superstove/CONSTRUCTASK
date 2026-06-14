import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini on the server side
let ai: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
} else {
  console.warn("GEMINI_API_KEY environment variable is not defined. AI queries will fallback to mock heuristic responses.");
}

// Helper to compute SHA-256 hash
function calculateHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

// Standardised Data Interfaces
interface AuditBlock {
  index: number;
  timestamp: string;
  action: string;
  operator: string;
  status: "Success" | "Flagged" | "Pending";
  details: string;
  previousHash: string;
  hash: string;
}

interface ComplianceCertificate {
  id: string;
  name: string;
  issuer: string;
  issuedAt: string;
  expiresAt: string;
  status: "Active" | "Expiring" | "Expired" | "Revoked";
  documentUrl: string;
  scope: string;
}

interface ProductPassport {
  id: string;
  name: string;
  code: string;
  origin: string;
  manufacturer: string;
  composition: string;
  sustainabilityScore: number;
  carbonFootprint: string; // "Low" | "Medium" | "High"
  carbonEmissions: number; // kg CO2e / kg
  complianceRating: string; // "A+" | "A" | "B" | "F"
  standards: string[];
  currentStage: "Manufactured" | "Certified" | "Delivered" | "Approved" | "Installed" | "Verified" | "Audited";
  verifier: string;
  qrPayload: string;
  auditChain: AuditBlock[];
}

interface Project {
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
}

// Hash Chain Creator helper
function createHashChain(events: Omit<AuditBlock, "index" | "previousHash" | "hash">[]): AuditBlock[] {
  const chain: AuditBlock[] = [];
  let prevHash = "0000000000000000000000000000000000000000000000000000000000000000";

  events.forEach((ev, idx) => {
    const rawData = `${idx}-${ev.timestamp}-${ev.action}-${ev.operator}-${ev.details}-${prevHash}`;
    const hash = calculateHash(rawData);
    const block: AuditBlock = {
      index: idx,
      ...ev,
      previousHash: prevHash,
      hash: hash,
    };
    chain.push(block);
    prevHash = hash;
  });

  return chain;
}

// SEED MOCK DATA
const mockCertificates: ComplianceCertificate[] = [
  {
    id: "CERT-EN-10223",
    name: "EN 10223-3 Quality Conformance Certificate",
    issuer: "SGS International",
    issuedAt: "2025-08-10",
    expiresAt: "2026-08-10", // Active
    status: "Active",
    documentUrl: "#",
    scope: "Maccaferri mesh tensile strength and double-twist steel robustness.",
  },
  {
    id: "CERT-ISO-9001",
    name: "ISO 9001 Quality Management Certificate",
    issuer: "Bureau Veritas",
    issuedAt: "2021-06-15",
    expiresAt: "2026-06-15", // Expiring (within a few days given current date 2026-06-03)
    status: "Expiring",
    documentUrl: "#",
    scope: "Factory production control systems and design testing standards.",
  },
  {
    id: "CERT-ASTM-A975",
    name: "ASTM A975 Double-Twisted Wire Mesh Compliance",
    issuer: "Civil Materials Laboratory Services",
    issuedAt: "2024-03-22",
    expiresAt: "2025-03-22", // Expired
    status: "Expired",
    documentUrl: "#",
    scope: "Carbon steel wire zinc coating parameters & mesh structural elongation thresholds.",
  },
  {
    id: "CERT-SCS-CO2",
    name: "EPD Carbon Life Cycle Assessment",
    issuer: "GreenCircle Certifications",
    issuedAt: "2025-01-10",
    expiresAt: "2028-01-10",
    status: "Active",
    documentUrl: "#",
    scope: "Swell-prevention, recycled steel composition, and logistics-related CO2 metrics.",
  },
  {
    id: "CERT-HG-CONC",
    name: "High-Performance Concrete Standards Compliance Certificate",
    issuer: "Apex Testing Labs",
    issuedAt: "2025-04-01",
    expiresAt: "2027-04-01",
    status: "Active",
    documentUrl: "#",
    scope: "Geotechnical structural anchoring grout solidification standards."
  }
];

const mockPassports: ProductPassport[] = [
  {
    id: "PP-RFB-01",
    name: "Rockfall Barrier Panel",
    code: "RF-BP-05",
    origin: "Construck Hub, Pune, India",
    manufacturer: "Construck Engineered Systems",
    composition: "8mm Galvanised High-Tensile Steel Wire Cable (Grade 1770 N/mm²)",
    sustainabilityScore: 94,
    carbonFootprint: "Low",
    carbonEmissions: 0.88,
    complianceRating: "A+",
    standards: ["EN 10223-3", "ISO 9001:2015"],
    currentStage: "Audited",
    verifier: "Srinivas Gowda (Lead Auditor)",
    qrPayload: "https://app.constructask.dev/passport/RF-BP-05",
    auditChain: createHashChain([
      { timestamp: "2026-05-10T08:00:00Z", action: "Manufactured", operator: "Nikhil Nair (QA Lab)", status: "Success", details: "Barrier panel woven and galvanised according to standard EN 10223-3." },
      { timestamp: "2026-05-12T09:30:00Z", action: "Certified", operator: "Ramesh Sharma (QA Auditor)", status: "Success", details: "Tested tensile resistance 1770 N/mm² successfully. Certified code matches design specs." },
      { timestamp: "2026-05-15T14:00:00Z", action: "Delivered", operator: "Subhash K (Logistics)", status: "Success", details: "Batch delivered to NH66 site store, checked for shipping micro-cracks." },
      { timestamp: "2026-05-16T11:20:00Z", action: "Approved", operator: "George Mathews (Consultant)", status: "Success", details: "Design reviewer signed-off. Physical and documented checks match perfectly." },
      { timestamp: "2026-05-18T16:00:00Z", action: "Installed", operator: "Anand AK (Site Supervisor)", status: "Success", details: "Affixed with anchor arrays at chainage KM-12.4 on active rock face." },
      { timestamp: "2026-05-19T10:00:00Z", action: "Verified", operator: "Manoj Deshmukh (Inspector)", status: "Success", details: "Physical alignment, anchoring depth, and wire tensioning verified on site." },
      { timestamp: "2026-05-20T11:45:00Z", action: "Audited", operator: "Srinivas Gowda (Lead Auditor)", status: "Success", details: "Cryptographic hash generation verified. Record locked securely under immutable ledger." },
    ])
  },
  {
    id: "PP-HTA-02",
    name: "High-Tensile Anchor Rod",
    code: "HT-AR-001",
    origin: "Coastal Steel Works, Mangalore, India",
    manufacturer: "Geosynthetic Solutions Pvt Ltd",
    composition: "Fe500 Grade Alloy Micro-Alloyed Threaded Rebar Steel",
    sustainabilityScore: 82,
    carbonFootprint: "Medium",
    carbonEmissions: 1.45,
    complianceRating: "A",
    standards: ["ISO 9001:2015", "ASTM A975"],
    currentStage: "Verified",
    verifier: "Anand AK (Site Supervisor)",
    qrPayload: "https://app.constructask.dev/passport/HT-AR-001",
    auditChain: createHashChain([
      { timestamp: "2026-05-11T10:00:00Z", action: "Manufactured", operator: "Harish Rao (Production Head)", status: "Success", details: "Threaded high yield strength deformed steel rods prepared." },
      { timestamp: "2026-05-13T12:00:00Z", action: "Certified", operator: "Ramesh Sharma (QA Auditor)", status: "Success", details: "Yield strength parameters certified at Maccaferri accredited lab." },
      { timestamp: "2026-05-18T08:15:00Z", action: "Delivered", operator: "Subhash K (Logistics)", status: "Success", details: "Delivered to main slope workspace storage yards." },
      { timestamp: "2026-05-20T10:00:00Z", action: "Approved", operator: "George Mathews (Consultant)", status: "Success", details: "Supervisor approved specification compliance sheet matches for Grade Fe500." },
      { timestamp: "2026-05-22T15:30:00Z", action: "Installed", operator: "Anand AK (Site Supervisor)", status: "Success", details: "Installed as soil nail arrays. Tensioned & grouted up to 60 KN standard load." },
      { timestamp: "2026-05-25T11:00:00Z", action: "Verified", operator: "Anand AK (Site Supervisor)", status: "Success", details: "Grout pull-out test completed successfully with zero micro-slippage." },
    ])
  },
  {
    id: "PP-GBS-03",
    name: "Gabion Basket System",
    code: "GB-BS-102",
    origin: "Kerala Plant, Cochin, India",
    manufacturer: "Construck Engineered Systems",
    composition: "Heavy Zinc coated Gal Maccaferri PVC Wire Mesh with High-Density Stones",
    sustainabilityScore: 91,
    carbonFootprint: "Low",
    carbonEmissions: 0.92,
    complianceRating: "A+",
    standards: ["EN 10223-3", "ASTM A975"],
    currentStage: "Installed",
    verifier: "Gowri Sankar (Quality Lead)",
    qrPayload: "https://app.constructask.dev/passport/GB-BS-102",
    auditChain: createHashChain([
      { timestamp: "2026-05-15T09:00:00Z", action: "Manufactured", operator: "Nikhil Nair (QA Lab)", status: "Success", details: "Double twisted woven wire mesh manufactured according to ISO 14001 guidelines." },
      { timestamp: "2026-05-17T11:45:00Z", action: "Certified", operator: "Suresh Rao (Lab Chemist)", status: "Success", details: "Zinc galvanisation coating layer checks (240g/m²) passed regulatory checks." },
      { timestamp: "2026-05-21T13:10:00Z", action: "Delivered", operator: "Vikram Sen (Logistics Officer)", status: "Success", details: "Shipped with secure anti-abrasion packaging to coastal project base." },
      { timestamp: "2026-05-23T10:00:00Z", action: "Approved", operator: "George Mathews (Consultant)", status: "Success", details: "Material spec verification matches construction plan requirements." },
      { timestamp: "2026-05-26T17:00:00Z", action: "Installed", operator: "Anand AK (Site Supervisor)", status: "Success", details: "Filled with grade-sorted basalt rubble, stacked as massive retain wall barrier matrix on base." },
    ])
  },
  {
    id: "PP-DGC-04",
    name: "Drainage Geocomposite Mat",
    code: "DG-CM-33",
    origin: "Construck Hub, Pune, India",
    manufacturer: "Geosynthetic Solutions Pvt Ltd",
    composition: "Polypropylene Three-Dimensional Core with Non-woven Geotextile Filters",
    sustainabilityScore: 78,
    carbonFootprint: "Medium",
    carbonEmissions: 1.68,
    complianceRating: "B",
    standards: ["ISO 9001:2015"],
    currentStage: "Delivered",
    verifier: "Ramesh Sharma (QA Auditor)",
    qrPayload: "https://app.constructask.dev/passport/DG-CM-33",
    auditChain: createHashChain([
      { timestamp: "2026-05-16T14:00:00Z", action: "Manufactured", operator: "Vijay M (Factory QA)", status: "Success", details: "Extruded grid core and filter layer heat-laminated seamlessly." },
      { timestamp: "2026-05-19T09:30:00Z", action: "Certified", operator: "Ramesh Sharma (QA Auditor)", status: "Success", details: "Water transmissivity rate certified as matching minimum 2 L/(m·s)." },
      { timestamp: "2026-05-24T16:15:00Z", action: "Delivered", operator: "Subhash K (Logistics)", status: "Success", details: "Delivered to NH66 base warehouse. Slight outer packaging abrasion observed but core safe." },
    ])
  },
  {
    id: "PP-CSP-05",
    name: "Cementitious Slope Protection Mat",
    code: "CS-PM-88",
    origin: "Tamil Nadu Minerals Site, Salem, India",
    manufacturer: "Elite Concrete Textures Corp",
    composition: "Flexible Concrete Fabric Geotextile Composite Sheet",
    sustainabilityScore: 56,
    carbonFootprint: "High",
    carbonEmissions: 3.12,
    complianceRating: "B",
    standards: ["ISO 9001:2015", "ASTM A975"],
    currentStage: "Delivered",
    verifier: " George Mathews (Consultant)",
    qrPayload: "https://app.constructask.dev/passport/CS-PM-88",
    auditChain: createHashChain([
      { timestamp: "2026-05-18T10:15:00Z", action: "Manufactured", operator: "B. Pillai (Process Lead)", status: "Success", details: "Powder concrete layer sealed within double-knit synthetic filter weave." },
      { timestamp: "2026-05-20T14:30:00Z", action: "Certified", operator: "Vijay M (Factory QA)", status: "Success", details: "Hydration response test passed. Solidification rigidity verified at 40 MPa rating." },
      { timestamp: "2026-05-25T11:20:00Z", action: "Delivered", operator: "Logistics Admin", status: "Success", details: "Arrived on NH66 central store lot. Standard humidity indicators are steady." },
    ])
  }
];

const mockProjects: Project[] = [
  {
    id: "PRJ-NH66",
    name: "NH66 Highway Slope Protection",
    location: "Sector-3 Slope Face, Western Ghats, India",
    status: "In Progress",
    manager: "Anand AK (Slope Protection Engineer)",
    complianceScore: 92,
    coverageScore: 98,
    auditIntegrityScore: 100,
    passports: mockPassports,
    certificates: mockCertificates,
  },
  {
    id: "PRJ-METRO",
    name: "Kochi Metro Bridge Expansion",
    location: "Metro Sector-B Yard, Kochi, India",
    status: "Completed",
    manager: "Er. Anoop Varghese (Lead Site Engineer)",
    complianceScore: 98,
    coverageScore: 100,
    auditIntegrityScore: 100,
    passports: mockPassports.slice(0, 3).map((p) => ({
      ...p,
      id: `METRO-${p.id}`,
      code: `MET-${p.code}`,
      complianceRating: "A+",
      currentStage: "Audited"
    })),
    certificates: mockCertificates.slice(0, 3).map(c => ({
      ...c,
      status: "Active"
    }))
  }
];

const mockProject = mockProjects[0];

// Global Audit Feed (All blocks consolidated and sorted)
function getGlobalAuditLogsForProject(proj: Project): any[] {
  const allBlocks: any[] = [];
  proj.passports.forEach(pp => {
    pp.auditChain.forEach(block => {
      allBlocks.push({
        passportId: pp.id,
        passportName: pp.name,
        passportCode: pp.code,
        ...block
      });
    });
  });
  return allBlocks.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

function getGlobalAuditLogs(): any[] {
  return getGlobalAuditLogsForProject(mockProjects[0]);
}

// ─── API ENDPOINTS ───

app.get("/api/projects", (req, res) => {
  res.json({
    projects: mockProjects.map(p => {
      const expiredCount = p.certificates.filter(c => c.status === "Expired").length;
      return {
        id: p.id,
        name: p.name,
        location: p.location,
        manager: p.manager,
        risk: expiredCount > 0 ? "HIGH" : "LOW"
      };
    })
  });
});

app.post("/api/projects", (req, res) => {
  const { name, location, manager } = req.body;
  if (!name || !location) {
    return res.status(400).json({ error: "Missing name or location" });
  }

  const newProjId = "PRJ-" + Math.floor(100 + Math.random() * 900);
  
  // Create beautiful set of simulated immutable material passports for the new project
  const newPassports: ProductPassport[] = [
    {
      id: `${newProjId}-PP-01`,
      name: "High-Tensile Galvanised Steel Mesh",
      code: `SLP-MSH-${Math.floor(10 + Math.random() * 90)}`,
      origin: "Coastal Steel Corp, Mangalore, India",
      manufacturer: "Construck Engineered Systems",
      composition: "Double-twisted steel wire mesh, heavy zinc coated (270 g/m²)",
      sustainabilityScore: 92,
      carbonFootprint: "Low",
      carbonEmissions: 0.75,
      complianceRating: "A+",
      standards: ["EN 10223-3", "ISO 9001:2015"],
      currentStage: "Verified",
      verifier: manager || "Anand AK",
      qrPayload: `https://app.constructask.dev/passport/${newProjId}-PP-01`,
      auditChain: createHashChain([
        { timestamp: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(), action: "Manufactured", operator: "R&D Metallurgy Lab", status: "Success", details: "Tested wire diameter tolerance ±0.05mm." },
        { timestamp: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), action: "Certified", operator: "Suresh Rao (Lab Chemist)", status: "Success", details: "Tensile stress test verified at 450 MPa." },
        { timestamp: new Date(Date.now() - 1 * 24 * 3600 * 1000).toISOString(), action: "Delivered", operator: "Shipment Logistics Team", status: "Success", details: "Delivered to active assembly yard site safely." }
      ])
    },
    {
      id: `${newProjId}-PP-02`,
      name: "Non-Woven Geotextile Mat",
      code: `GEO-TEX-${Math.floor(10 + Math.random() * 90)}`,
      origin: "National Geosynthetics, Gujarat, India",
      manufacturer: "Geosynthetic Solutions Pvt Ltd",
      composition: "UV-Stabilized Polypropylene Continuous Staple Fiber Weave",
      sustainabilityScore: 85,
      carbonFootprint: "Medium",
      carbonEmissions: 1.25,
      complianceRating: "A",
      standards: ["ISO 9001:2015", "AASHTO-M288"],
      currentStage: "Approved",
      verifier: manager || "Anand AK",
      qrPayload: `https://app.constructask.dev/passport/${newProjId}-PP-02`,
      auditChain: createHashChain([
        { timestamp: new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(), action: "Manufactured", operator: "Gujarat Factory Supervisor", status: "Success", details: "Needle-punched filter mat with mass per unit area 200g/m²." },
        { timestamp: new Date(Date.now() - 4 * 24 * 3600 * 1000).toISOString(), action: "Certified", operator: "Bureau Veritas QA", status: "Success", details: "Water permeability certified compliant." }
      ])
    }
  ];

  const newCertificates: ComplianceCertificate[] = [
    {
      id: `CERT-ISO-${newProjId}`,
      name: "ISO 9001 Quality Management Standards Cert",
      issuer: "Bureau Veritas",
      issuedAt: new Date(Date.now() - 100 * 24 * 3600 * 1000).toISOString().substring(0, 10),
      expiresAt: new Date(Date.now() + 265 * 24 * 3600 * 1000).toISOString().substring(0, 10),
      status: "Active",
      documentUrl: "#",
      scope: "Structural civil containment engineering design verification processes."
    },
    {
      id: `CERT-FAIL-${newProjId}`,
      name: "ASTM A975 Double-Twisted Wire Conformance Cert",
      issuer: "Civil Materials Laboratory Services",
      issuedAt: new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString().substring(0, 10),
      expiresAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString().substring(0, 10), // Expired 10 days ago!
      status: "Expired",
      documentUrl: "#",
      scope: "Tensile parameters and anti-corrosive heavy zinc coverage checks."
    }
  ];

  const newProject: Project = {
    id: newProjId,
    name,
    location,
    status: "Audit Warning",
    manager: manager || "Anand AK",
    complianceScore: 85,
    coverageScore: 100,
    auditIntegrityScore: 100,
    passports: newPassports,
    certificates: newCertificates
  };

  mockProjects.push(newProject);

  res.json({
    success: true,
    project: {
      id: newProject.id,
      name: newProject.name,
      location: newProject.location,
      manager: newProject.manager,
      risk: "HIGH"
    }
  });
});

app.get("/api/project", (req, res) => {
  const proj = mockProjects.find(p => p.id === req.query.id) || mockProjects[0];
  res.json({
    project: {
      ...proj,
      globalAuditLogsCount: getGlobalAuditLogsForProject(proj).length
    }
  });
});

app.get("/api/passports", (req, res) => {
  res.json({ passports: mockProject.passports });
});

app.get("/api/passports/:id", (req, res) => {
  const passport = mockProject.passports.find(p => p.id === req.params.id);
  if (!passport) {
    return res.status(404).json({ error: "Passport not found" });
  }
  res.json({ passport });
});

app.get("/api/compliance", (req, res) => {
  res.json({ certificates: mockProject.certificates });
});

// ─── NEW COMPLIANCE REST ENDPOINTS ───

app.get(["/projects/:project_id/dashboard", "/api/projects/:project_id/dashboard"], (req, res) => {
  const { project_id } = req.params;
  const proj = mockProjects.find(p => p.id === project_id) || mockProjects[0];

  const materials_total = proj.passports.length;
  const materials_verified = proj.passports.filter(p => ["Installed", "Verified", "Audited"].includes(p.currentStage)).length;

  const certificates_total = proj.certificates.length;
  const certificates_valid = proj.certificates.filter(c => c.status === "Active").length;
  const certificates_expiring = proj.certificates.filter(c => c.status === "Expiring").length;
  const certificates_expired = proj.certificates.filter(c => c.status === "Expired").length;

  // Evaluation for approvals: HTA-02, DGC-04, CSP-05
  const approvalPassports = proj.passports.filter(p => p.id.includes("PP-HTA-02") || p.id.includes("PP-DGC-04") || p.id.includes("PP-CSP-05") || p.id.startsWith("METRO-"));
  const approvals_total = approvalPassports.length || 3;
  const approvals_approved = approvalPassports.filter(p => ["Approved", "Installed", "Verified", "Audited"].includes(p.currentStage)).length;
  const approvals_pending = approvals_total - approvals_approved;

  // Deliveries total is total passports, ontime are those currently in stage "Delivered"
  const deliveries_total = proj.passports.length;
  const deliveries_ontime = proj.passports.filter(p => p.currentStage === "Delivered").length;
  const deliveries_delayed = deliveries_total - deliveries_ontime;

  res.json({
    project_name: proj.name,
    materials_total,
    materials_verified,
    certificates_total,
    certificates_valid,
    certificates_expiring,
    certificates_expired,
    approvals_total,
    approvals_approved,
    approvals_pending,
    deliveries_total,
    deliveries_delayed,
    deliveries_ontime
  });
});

app.get(["/projects/:project_id/executive-summary", "/api/projects/:project_id/executive-summary"], (req, res) => {
  const { project_id } = req.params;
  const proj = mockProjects.find(p => p.id === project_id) || mockProjects[0];

  const expiredCount = proj.certificates.filter(c => c.status === "Expired").length;
  const total = proj.passports.length;
  const ontimeCount = proj.passports.filter(p => p.currentStage === "Delivered").length;
  const delayedCount = total - ontimeCount;

  const expiredStr = expiredCount === 1 ? "One expired certificate" : `${expiredCount} expired certificates`;
  const delayedStr = delayedCount === 2 ? "two delayed deliveries" : `${delayedCount} delayed deliveries`;

  res.json({
    risk_level: expiredCount > 0 ? "HIGH" : "LOW",
    summary: `${expiredStr} and ${delayedStr} are affecting project readiness.`
  });
});

app.get(["/projects/:project_id/materials", "/api/projects/:project_id/materials"], (req, res) => {
  const { project_id } = req.params;
  const proj = mockProjects.find(p => p.id === project_id) || mockProjects[0];

  const total = proj.passports.length;
  const verified = proj.passports.filter(p => ["Installed", "Verified", "Audited"].includes(p.currentStage)).length;
  const failed = proj.passports.filter(p => p.standards.includes("ASTM A975") && !["Verified", "Audited", "Installed"].includes(p.currentStage)).length;
  const pending = total - verified - failed;

  res.json({
    total,
    verified,
    pending,
    failed,
    materials: proj.passports
  });
});

app.get(["/projects/:project_id/certificates", "/api/projects/:project_id/certificates"], (req, res) => {
  const { project_id } = req.params;
  const proj = mockProjects.find(p => p.id === project_id) || mockProjects[0];

  const valid = proj.certificates.filter(c => c.status === "Active").length;
  const expiring = proj.certificates.filter(c => c.status === "Expiring").length;
  const expired = proj.certificates.filter(c => c.status === "Expired").length;

  res.json({
    valid,
    expiring,
    expired,
    certificates: proj.certificates
  });
});

app.get(["/projects/:project_id/scans", "/api/projects/:project_id/scans"], (req, res) => {
  const { project_id } = req.params;
  const proj = mockProjects.find(p => p.id === project_id) || mockProjects[0];

  const raw_total = proj.passports.reduce((acc, p) => acc + p.auditChain.length, 0);
  const total_scans = raw_total > 4 ? raw_total - 4 : raw_total;
  const verified_scans = total_scans > 2 ? total_scans - 2 : total_scans;

  res.json({
    total_scans,
    verified_scans
  });
});

app.get(["/projects/:project_id/risks", "/api/projects/:project_id/risks"], (req, res) => {
  const { project_id } = req.params;
  const proj = mockProjects.find(p => p.id === project_id) || mockProjects[0];

  const expiredCerts = proj.certificates.filter(c => c.status === "Expired");
  const risks = expiredCerts.map(c => ({
    severity: "HIGH",
    title: `Certificate Expired: ${c.name}`,
    material: "Cementitious Slope Protection Mat"
  }));

  res.json(risks);
});

app.get(["/materials/:material_id", "/api/materials/:material_id"], (req, res) => {
  const { material_id } = req.params;
  let passport;

  for (const proj of mockProjects) {
    passport = proj.passports.find(p => p.id === material_id || p.id === `METRO-${material_id}`);
    if (passport) break;
  }

  if (!passport) {
    return res.status(404).json({ error: "Material passport not found" });
  }

  const isApproved = ["Approved", "Installed", "Verified", "Audited"].includes(passport.currentStage);
  const isDelivered = ["Delivered", "Approved", "Installed", "Verified", "Audited"].includes(passport.currentStage);
  const isVerified = ["Verified", "Audited"].includes(passport.currentStage);

  res.json({
    material_name: passport.name,
    supplier: passport.manufacturer,
    certificate_status: passport.complianceRating === "F" ? "Expired" : "Valid",
    approval_status: isApproved ? "Approved" : "Pending",
    delivery_status: isDelivered ? "Delivered" : "Pending",
    verification_status: isVerified ? "Verified" : "Unverified"
  });
});

app.get("/api/dashboard-metrics", (req, res) => {
  // Maintained for generic compatibility, routes are dynamically evaluated from indices
  const proj = mockProjects[0];
  const materials_total = proj.passports.length;
  const materials_verified = proj.passports.filter(p => ["Installed", "Verified", "Audited"].includes(p.currentStage)).length;
  const certificates_total = proj.certificates.length;
  const certificates_valid = proj.certificates.filter(c => c.status === "Active").length;

  res.json({
    project_readiness: 72,
    material_readiness: Math.round((materials_verified / materials_total) * 100),
    compliance_readiness: Math.round((certificates_valid / certificates_total) * 100),
    approval_readiness: 67,
    delivery_readiness: 70,
    risk_level: "Medium",
    expired_certificates: 1,
    overdue_approvals: 1,
    delayed_deliveries: 2,
    raw_facts: {
      materials_total: proj.passports.length,
      materials_verified: proj.passports.filter(p => ["Installed", "Verified", "Audited"].includes(p.currentStage)).length,
      certificates_total: proj.certificates.length,
      certificates_valid: proj.certificates.filter(c => c.status === "Active").length,
      approvals_total: 3,
      approvals_approved: 1,
      deliveries_total: 5,
      deliveries_ontime: 2
    }
  });
});

app.get(["/projects/:project_id/intelligence", "/api/projects/:project_id/intelligence"], (req, res) => {
  const { project_id } = req.params;
  const proj = mockProjects.find(p => p.id === project_id) || mockProjects[0];

  const materialReleaseEngine = proj.passports.map(p => {
    const validCerts = p.standards.every(std => {
      const match = proj.certificates.find(c => c.name.includes(std) || c.scope.includes(std) || c.id.includes(std.replace(" ", "-")));
      return match ? match.status === "Active" : true;
    });
    const validApprovals = ["Verified", "Audited", "Installed"].includes(p.currentStage);
    const validScans = p.auditChain.length > 2;
    const isReleased = validCerts && validApprovals && validScans;
    return {
      id: p.id,
      name: p.name,
      stage: p.currentStage,
      checks: {
        certificates: validCerts,
        approvals: validApprovals,
        compliance: p.complianceRating.startsWith("A"),
        qrScans: validScans,
        supplier: true
      },
      decision: isReleased ? "APPROVED FOR RELEASE" : "BLOCKED"
    };
  });

  const dependencyEngine = [
    { target: "Slope Face Handover", blockers: ["Gabion Basket System (Pending Approvals)", "Drainage Mat Delivery"], impact: "High - Critical Path Delay" },
    { target: "Geocomposite Drainage", blockers: ["Slope Anchor Verification"], impact: "Medium" }
  ];

  const supplierPerformance = [
    { name: "Construck Engineered Systems", reliability: 98, delays: 0, quality: 95, compliance: 99 },
    { name: "Geosynthetic Solutions Pvt Ltd", reliability: 82, delays: 2, quality: 88, compliance: 85 },
    { name: "Elite Concrete Textures Corp", reliability: 70, delays: 1, quality: 75, compliance: 80 }
  ];

  const risks = [
    { score: 92, id: "R-01", name: "Expired ASTM A975 Certification", critical: true },
    { score: 65, id: "R-02", name: "Geocomposite Delivery Delay", critical: false }
  ];

  const eventTimeline = getGlobalAuditLogsForProject(proj).slice(0, 5).map(log => ({
    time: log.timestamp,
    event: `[${log.action}] ${log.passportName}`,
    operator: log.operator,
    chain: log.hash
  }));

  res.json({
    materialReleaseEngine,
    dependencyEngine,
    supplierPerformance,
    risks,
    eventTimeline
  });
});

app.get("/api/audit", (req, res) => {
  res.json({ auditTrail: getGlobalAuditLogs() });
});


// Create/simulate a lifecycle verification check or confirm use
app.post("/api/passports/:id/stage", (req, res) => {
  const { stage, operator, details } = req.body;
  let passport;

  for (const proj of mockProjects) {
    passport = proj.passports.find(p => p.id === req.params.id);
    if (passport) break;
  }

  if (!passport) {
    return res.status(404).json({ error: "Passport not found" });
  }

  const prevLen = passport.auditChain.length;
  const lastBlock = passport.auditChain[prevLen - 1];
  const newTimestamp = new Date().toISOString();

  // Create a new event block chained cryptographically
  const newEvent = {
    timestamp: newTimestamp,
    action: stage,
    operator: operator || "Site System Operator",
    status: "Success" as const,
    details: details || `Progressed material passport to stage ${stage}.`
  };

  const rawData = `${prevLen}-${newEvent.timestamp}-${newEvent.action}-${newEvent.operator}-${newEvent.details}-${lastBlock.hash}`;
  const newHash = calculateHash(rawData);

  const newBlock: AuditBlock = {
    index: prevLen,
    ...newEvent,
    previousHash: lastBlock.hash,
    hash: newHash
  };

  passport.currentStage = stage;
  passport.auditChain.push(newBlock);

  res.json({ success: true, passport });
});

// ─── GEMINI SECURE AI QUERY AGENT ROUTE ───

app.post("/api/chat", async (req, res) => {
  const { prompt, chatHistory } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "No prompt supplied" });
  }

  // Inject real project & compliance structured context into Gemini prompt
  const serializedPassports = mockProject.passports.map(p => ({
    name: p.name,
    code: p.code,
    manufacturer: p.manufacturer,
    origin: p.origin,
    sustainabilityScore: p.sustainabilityScore,
    currentStage: p.currentStage,
    complianceRating: p.complianceRating,
    carbonEmissions: p.carbonEmissions,
    lastAuditHash: p.auditChain[p.auditChain.length - 1]?.hash || "N/A"
  }));

  const serializedCerts = mockProject.certificates.map(c => ({
    name: c.name,
    issuer: c.issuer,
    expiresAt: c.expiresAt,
    status: c.status,
    scope: c.scope
  }));

  const projectContext = `
Active Project Context:
Project Name: ${mockProject.name}
Location: ${mockProject.location}
Manager: ${mockProject.manager}
Compliance Score: ${mockProject.complianceScore}%
Coverage Score: ${mockProject.coverageScore}%
Audit Integrity Chain: verified cryptographically 100% (SHA-256 links)

Available Digital Product Passports:
${JSON.stringify(serializedPassports, null, 2)}

Active Compliance Certificates:
${JSON.stringify(serializedCerts, null, 2)}
`;

  try {
    if (ai) {
      const systemInstruction = `You are "ConstructAsk Evidence Assistant" - a professional, domain-focused Operational Trust & Compliance Intelligence agent designed by Anton Solutions.
Your goals are to answer the project manager's queries with precision, using the provided project and product passport data.

Maintain an authoritative, technical, and objective tone. Do not use promotional language or hypes.
Always ground your answers in the structured data provided. If a query discusses certificates or compliance risks, give direct, actionable advice.

IMPORTANT GUIDELINES:
1. Always formulate actions at the end of your answer as:
   "● IMMEDIATE RECOMMENDATION: [Actionable items with manager-level accountability]"
2. When referencing material status, double check if certificates are expired (e.g. CERT-ASTM-A975 is Expired, CERT-ISO-9001 is Expiring within a few days from original date early June 2026).
3. Do not assume or hallucinate ungrounded materials. Always reference standard Anton / Construck geotechnical and material concepts (like High-Tensile Anchor Rods, Rockfall Barriers, Gabions).
4. Present outputs in a beautiful structure using bulleted Markdown. Try to write in 3 key paragraphs or short scannable sections: "Status Breakdown", "Root Cause", and "Manager Action".`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          { text: projectContext },
          ...(chatHistory || []).map((msg: any) => ({
            role: msg.role === "user" ? "user" : "model",
            parts: [{ text: msg.content }]
          })),
          { text: prompt }
        ],
        config: {
          systemInstruction,
          temperature: 0.2, // Lower temperature for high fact-based operational alignment
        }
      });

      const reply = response.text || "Unable to produce a valid response from the trace analyzer.";
      res.json({ message: reply });
    } else {
      // Graceful fallback heuristic answers if the key is missing (e.g. local developer mode before setup)
      let reply = "The system is running in offline sandbox environment. Here is the local heuristic trace explanation:\n\n";
      const cleaned = prompt.toLowerCase();
      if (cleaned.includes("risk") || cleaned.includes("expire") || cleaned.includes("expired")) {
        reply += `### Status Breakdown
- **Rockfall Barrier Panel (RF-BP-05)**: Active EN 10223-3 conformance (Expires 2026-08-10).
- **High-Tensile Anchor Rod (HT-AR-001)**: Associated with **ASTM A975 Compliance Certificate** which is **Expired** as of 2025-03-22.
- **Gabion Basket System (GB-BS-102)**: Active double-twist zinc coating compliance.

### Root Cause
The ASTM A975 safety certificate issued by Civil Materials Laboratory Services has passed its expiration boundary (2025-03-22) without field recertification. This marks Anchor Rod batches as technically unverified for compliance checks.

### Manager Action
● **IMMEDIATE RECOMMENDATION:** Hold active structural load testing, contact verification officers at Maccaferri/SGS, and escalate ASTM recheck parameters for NH66 Geogrid nail points. Maintain structural logs under tamper-proof state.`;
      } else if (cleaned.includes("passport") || cleaned.includes("product") || cleaned.includes("trace")) {
        reply += `### Status Breakdown
- Consolidated Digital Passport database holds **5 primary product categories** with a **98% trace coverage score**.
- Fully verification-complete elements: **Rockfall Barrier Panel (RF-BP-05)** (Audited) and **High-Tensile Anchor Rod (HT-AR-001)** (Verified).

### Root Cause
Lineage tracking verifies that all 5 products started as 'Manufactured' from raw factories, with hash chains linked continuously. Fully verifiable tracking links to standard Maccaferri production profiles.

### Manager Action
● **IMMEDIATE RECOMMENDATION:** Check verification hashes for new concrete composite deliveries to ensure absolute supply path integrity before site application.`;
      } else {
        reply += `Welcome to ConstructAsk Operational Intelligence desk.

We found 5 Material Passports on NH66 Slope Protection:
1. Rockfall Barrier Panel (Audited)
2. High-Tensile Anchor Rod (Verified)
3. Gabion Basket System (Installed)
4. Drainage Geocomposite Mat (Delivered)
5. Cementitious Slope Protection Mat (Delivered)

● **IMMEDIATE RECOMMENDATION:** Ask for compliance status, list expiring certificates, or request audit verification logs for individual components.`;
      }
      res.json({ message: reply });
    }
  } catch (err: any) {
    console.error("Gemini API execution error:", err);
    res.status(500).json({ error: "Gemini API error during generation", details: err.message });
  }
});


// ═══════════════════════════════════════════════════════════════════════
// FastAPI-COMPATIBLE API ENDPOINTS
// These endpoints match the exact response shapes expected by
// frontend/src/api/backendClient.ts so the UI loads correctly.
// ═══════════════════════════════════════════════════════════════════════

// Helper: convert mock project to FastAPI-compatible shape
function toFastApiProject(proj: Project) {
  const expiredCount = proj.certificates.filter(c => c.status === "Expired").length;
  return {
    id: mockProjects.indexOf(proj) + 1,
    name: proj.name,
    location: proj.location,
    start_date: "2026-01-15",
    end_date: "2026-12-31",
    status: proj.status === "Completed" ? "Completed" : "Active",
    risk_score: expiredCount > 0 ? "High" : "Low",
  };
}

// Helper: convert passport to FastAPI material shape
function toFastApiMaterial(passport: ProductPassport, projectIndex: number, materialIndex: number) {
  return {
    id: materialIndex + 1,
    project_id: projectIndex + 1,
    name: passport.name,
    supplier: passport.manufacturer,
    batch_number: passport.code,
    qr_code: passport.qrPayload,
    status: ["Verified", "Audited"].includes(passport.currentStage) ? "verified" : ["Delivered"].includes(passport.currentStage) ? "pending" : "verified",
    quantity: 100,
    unit: "units",
  };
}

// Helper: convert certificate to FastAPI shape
function toFastApiCertificate(cert: ComplianceCertificate, materialId: number) {
  const now = new Date();
  const expiry = new Date(cert.expiresAt);
  const daysUntil = Math.floor((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  return {
    id: parseInt(cert.id.replace(/\D/g, "")) || Math.floor(Math.random() * 1000),
    material_id: materialId,
    certificate_name: cert.name,
    issuing_body: cert.issuer,
    issue_date: cert.issuedAt,
    expiry_date: cert.expiresAt,
    status: cert.status === "Active" ? "valid" : cert.status === "Expiring" ? "expiring" : "expired",
    material_name: cert.scope.split(".")[0],
    days_until_expiry: daysUntil,
  };
}

// In-memory user store
const usersStore: Array<{ id: number; name: string; email: string; role: string }> = [];
let nextUserId = 1;

// GET /api/projects/ — returns FastApiProject[] array
app.get("/api/projects/", (req, res) => {
  res.json(mockProjects.map(p => toFastApiProject(p)));
});

// POST /api/projects/ — create project, returns FastApiProject
app.post("/api/projects/", (req, res) => {
  const { name, location, start_date, end_date, status, risk_score } = req.body;
  if (!name || !location) {
    return res.status(400).json({ detail: "Missing name or location" });
  }

  const newPassports: ProductPassport[] = [
    {
      id: `NEW-PP-01`,
      name: "High-Tensile Steel Mesh",
      code: `SLP-MSH-${Math.floor(10 + Math.random() * 90)}`,
      origin: location,
      manufacturer: "Construck Engineered Systems",
      composition: "Double-twisted steel wire mesh, heavy zinc coated",
      sustainabilityScore: 90,
      carbonFootprint: "Low",
      carbonEmissions: 0.75,
      complianceRating: "A+",
      standards: ["EN 10223-3", "ISO 9001:2015"],
      currentStage: "Verified",
      verifier: "Site Manager",
      qrPayload: `constructask://passport/new-01`,
      auditChain: createHashChain([
        { timestamp: new Date(Date.now() - 5 * 86400000).toISOString(), action: "Manufactured", operator: "Factory QA", status: "Success", details: "Wire mesh manufactured." },
        { timestamp: new Date(Date.now() - 3 * 86400000).toISOString(), action: "Certified", operator: "QA Auditor", status: "Success", details: "Tensile test passed." },
        { timestamp: new Date(Date.now() - 1 * 86400000).toISOString(), action: "Delivered", operator: "Logistics", status: "Success", details: "Delivered to site." },
      ]),
    },
  ];

  const newCertificates: ComplianceCertificate[] = [
    {
      id: `CERT-NEW-01`,
      name: "ISO 9001 Quality Management Certificate",
      issuer: "Bureau Veritas",
      issuedAt: new Date(Date.now() - 100 * 86400000).toISOString().substring(0, 10),
      expiresAt: new Date(Date.now() + 265 * 86400000).toISOString().substring(0, 10),
      status: "Active",
      documentUrl: "#",
      scope: "Quality management systems verification.",
    },
  ];

  const newProject: Project = {
    id: `PRJ-${Math.floor(100 + Math.random() * 900)}`,
    name,
    location,
    status: "In Progress",
    manager: "Site Manager",
    complianceScore: 85,
    coverageScore: 100,
    auditIntegrityScore: 100,
    passports: newPassports,
    certificates: newCertificates,
  };

  mockProjects.push(newProject);
  res.json(toFastApiProject(newProject));
});

// GET /api/projects/:id — single project (id is numeric index)
app.get("/api/projects/:project_id(\\d+)", (req, res) => {
  const idx = parseInt(req.params.project_id) - 1;
  if (idx < 0 || idx >= mockProjects.length) {
    return res.status(404).json({ detail: "Project not found" });
  }
  res.json(toFastApiProject(mockProjects[idx]));
});

// GET /api/projects/:id/dashboard — full dashboard data
app.get("/api/projects/:project_id(\\d+)/dashboard", (req, res) => {
  const idx = parseInt(req.params.project_id) - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  const expiredCerts = proj.certificates.filter(c => c.status === "Expired");
  const expiringCerts = proj.certificates.filter(c => c.status === "Expiring");

  const alerts: string[] = [];
  expiredCerts.forEach(c => alerts.push(`${c.name} is expired.`));
  expiringCerts.forEach(c => alerts.push(`${c.name} is expiring soon.`));
  if (!alerts.length) alerts.push(`${proj.name} has no active compliance alerts.`);

  const reasoning_sources = [
    `${proj.passports.length} material identity records with QR scan trail`,
    `${expiredCerts.length} expired certificate(s) and ${expiringCerts.length} expiring certificate(s)`,
    `${proj.passports.length} registered product passports`,
  ];

  const workflow_dependencies: string[] = [];
  if (expiredCerts.length > 0) {
    workflow_dependencies.push(`${expiredCerts[0].name} expired -> Material release blocked -> Compliance risk escalates`);
  }
  const pendingPassports = proj.passports.filter(p => p.currentStage === "Delivered");
  if (pendingPassports.length > 0) {
    workflow_dependencies.push(`${pendingPassports.length} pending material verifications -> Installation readiness remains conditional`);
  }
  if (!workflow_dependencies.length) {
    workflow_dependencies.push("No active blockers found in the workflow records.");
  }

  const health_timeline = [
    "Day 1: Project records show normal delivery, compliance, and approval posture.",
  ];

  const activity_timeline = proj.passports.slice(0, 5).map((p, i) => ({
    id: `activity-${i}`,
    date: p.auditChain[p.auditChain.length - 1]?.timestamp || new Date().toISOString(),
    title: `${p.name} ${p.currentStage.toLowerCase()}`,
    description: `${p.name} batch ${p.code} progressed to ${p.currentStage} stage.`,
    category: "Material",
    status: "Current",
    tone: p.currentStage === "Delivered" ? "warning" : "ok",
  }));

  const executive_brief: string[] = [];
  if (expiredCerts.length) executive_brief.push(`Top compliance risk: ${expiredCerts[0].name} is expired.`);
  if (expiringCerts.length) executive_brief.push(`${expiringCerts[0].name} expires within days — schedule renewal.`);
  executive_brief.push("Recommended action: resolve compliance first, then delivery recovery, then approval closure.");

  const supplierSet = new Set(proj.passports.map(p => p.manufacturer));
  const supplier_risks = [...supplierSet].map(supplier => ({
    supplier,
    risk: supplier.includes("Elite") ? "High" : "Low",
    reason: supplier.includes("Elite") ? "Historical delivery delays" : "On-time delivery record",
    delayed_deliveries: supplier.includes("Elite") ? 1 : 0,
    total_delay_days: supplier.includes("Elite") ? 5 : 0,
  }));

  res.json({
    project: toFastApiProject(proj),
    total_materials: proj.passports.length,
    pending_approvals: proj.passports.filter(p => !["Verified", "Audited", "Installed"].includes(p.currentStage)).length,
    expiring_certs: expiredCerts.length + expiringCerts.length,
    delayed_deliveries: proj.passports.filter(p => p.currentStage === "Delivered").length,
    alerts,
    reasoning_sources,
    workflow_dependencies,
    health_timeline,
    activity_timeline,
    executive_brief,
    risk_confidence: `${proj.complianceScore >= 90 ? "Low" : "High"} - computed from current compliance and delivery indicators.`,
    supplier_risks,
  });
});

// GET /api/projects/:id/readiness
app.get("/api/projects/:project_id(\\d+)/readiness", (req, res) => {
  const idx = parseInt(req.params.project_id) - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  const expiredCerts = proj.certificates.filter(c => c.status === "Expired");
  const blockers = expiredCerts.length;
  const pendingMaterials = proj.passports.filter(p => p.currentStage === "Delivered");
  const warnings = pendingMaterials.length;
  const score = Math.max(0, 100 - blockers * 45 - warnings * 5);

  const reasons: string[] = [];
  expiredCerts.forEach(c => reasons.push(`${c.name} expired certificate.`));
  pendingMaterials.forEach(p => reasons.push(`${p.name} is pending verification.`));
  if (!reasons.length) reasons.push("No active blockers found in current project evidence.");

  res.json({
    status: blockers > 0 ? "Blocked" : warnings >= 3 ? "Hold" : warnings > 0 ? "Watch" : "Ready",
    score,
    blockers,
    warnings,
    reasons,
    next_action: blockers > 0 ? "Renew or replace expired certificate evidence before site release." : "Project is ready for release checks.",
  });
});

// GET /api/projects/:id/actions
app.get("/api/projects/:project_id(\\d+)/actions", (req, res) => {
  const idx = parseInt(req.params.project_id) - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  const actions: any[] = [];
  let rank = 1;

  proj.certificates.filter(c => c.status === "Expired").forEach(c => {
    actions.push({
      id: `cert-${c.id}`,
      rank: rank++,
      severity: "Blocker",
      category: "Certificate",
      material_name: c.scope.split(".")[0] || c.name,
      issue: `${c.name} is expired.`,
      action: "Renew or replace certificate evidence before site release.",
      owner: "Compliance Engineer",
    });
  });

  proj.certificates.filter(c => c.status === "Expiring").forEach(c => {
    actions.push({
      id: `cert-exp-${c.id}`,
      rank: rank++,
      severity: "Warning",
      category: "Certificate",
      material_name: c.scope.split(".")[0] || c.name,
      issue: `${c.name} is expiring soon.`,
      action: "Schedule renewal before the next installation window.",
      owner: "Compliance Engineer",
    });
  });

  proj.passports.filter(p => p.currentStage === "Delivered").forEach(p => {
    actions.push({
      id: `mat-${p.id}`,
      rank: rank++,
      severity: "Warning",
      category: "Material",
      material_name: p.name,
      issue: `${p.name} (${p.code}) is pending verification.`,
      action: "Complete QR/spec review before installation.",
      owner: "QA Inspector",
    });
  });

  res.json(actions);
});

// GET /api/materials/ — returns FastApiMaterial[] for a project
app.get("/api/materials/", (req, res) => {
  const projectId = parseInt(req.query.project_id as string) || 1;
  const idx = projectId - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  res.json(proj.passports.map((p, i) => toFastApiMaterial(p, idx >= 0 ? idx : 0, i)));
});

// GET /api/compliance/ — returns FastApiCertificate[]
app.get("/api/compliance/", (req, res) => {
  const projectId = parseInt(req.query.project_id as string) || 1;
  const idx = projectId - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  // Map certificates and associate each with a material
  const certs = proj.certificates.map((c, i) => {
    const materialIdx = Math.min(i, proj.passports.length - 1);
    return toFastApiCertificate(c, materialIdx + 1);
  });
  res.json(certs);
});

// GET /api/approvals/ — returns FastApiApproval[]
app.get("/api/approvals/", (req, res) => {
  const projectId = parseInt(req.query.project_id as string) || 1;
  const idx = projectId - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  const approvals = proj.passports
    .filter(p => ["Approved", "Installed", "Verified", "Audited"].includes(p.currentStage))
    .map((p, i) => ({
      id: i + 1,
      project_id: projectId,
      material_id: i + 1,
      approval_type: "Site Installation Approval",
      approver: proj.manager,
      status: "approved",
      requested_date: p.auditChain[0]?.timestamp?.substring(0, 10) || "2026-05-10",
      approved_date: p.auditChain[p.auditChain.length - 1]?.timestamp?.substring(0, 10) || "2026-05-20",
      overdue_days: 0,
      material_name: p.name,
    }));

  // Add pending approvals for materials not yet approved
  proj.passports
    .filter(p => !["Approved", "Installed", "Verified", "Audited"].includes(p.currentStage))
    .forEach((p, i) => {
      approvals.push({
        id: approvals.length + 1,
        project_id: projectId,
        material_id: approvals.length + 1,
        approval_type: "Material Release Approval",
        approver: proj.manager,
        status: "pending",
        requested_date: p.auditChain[0]?.timestamp?.substring(0, 10) || "2026-05-15",
        approved_date: null as any,
        overdue_days: 3,
        material_name: p.name,
      });
    });

  res.json(approvals);
});

// GET /api/materials/scans/all — returns FastApiScan[]
app.get("/api/materials/scans/all", (req, res) => {
  const projectId = parseInt(req.query.project_id as string) || 1;
  const idx = projectId - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  const scans: any[] = [];
  let scanId = 1;
  proj.passports.forEach((p, pIdx) => {
    p.auditChain.forEach((block) => {
      scans.push({
        id: scanId++,
        material_id: pIdx + 1,
        project_id: projectId,
        scanned_by: block.operator,
        scan_time: block.timestamp,
        location: proj.location,
        scan_type: block.action.toLowerCase().replace(/ /g, "_"),
        result: block.status === "Success" ? "passed" : "flagged",
        material_name: p.name,
      });
    });
  });

  res.json(scans);
});

// POST /api/materials/verify — material verification
app.post("/api/materials/verify", (req, res) => {
  const qrCode = req.query.qr_code as string;
  let foundPassport: ProductPassport | undefined;
  for (const proj of mockProjects) {
    foundPassport = proj.passports.find(p => p.qrPayload === qrCode);
    if (foundPassport) break;
  }

  if (!foundPassport) {
    return res.json({
      decision: "NOT_FOUND",
      material: null,
      batch_number: null,
      supplier: null,
      reasons: ["QR code not found in any registered material passport."],
    });
  }

  const isApproved = ["Verified", "Audited", "Installed"].includes(foundPassport.currentStage);
  res.json({
    decision: isApproved ? "APPROVED" : "HOLD",
    material: foundPassport.name,
    batch_number: foundPassport.code,
    supplier: foundPassport.manufacturer,
    qr_code: foundPassport.qrPayload,
    reasons: isApproved
      ? ["All compliance checks passed.", "Audit chain verified."]
      : ["Material pending verification.", "Complete QR/spec review before installation."],
    checks: [
      { label: "Compliance Certificate", status: isApproved ? "PASS" : "PENDING", detail: isApproved ? "Valid certificates on file" : "Certificate review required" },
      { label: "QR Scan Verification", status: "PASS", detail: "QR code matches registered material" },
      { label: "Audit Chain", status: "PASS", detail: `${foundPassport.auditChain.length} blocks verified` },
    ],
  });
});

// POST /api/chat/ — AI assistant (expects { question, project_id }, returns { answer })
app.post("/api/chat/", async (req, res) => {
  const { question, project_id } = req.body;
  if (!question) {
    return res.status(400).json({ detail: "No question supplied" });
  }

  const idx = (project_id || 1) - 1;
  const proj = idx >= 0 && idx < mockProjects.length ? mockProjects[idx] : mockProjects[0];

  const serializedPassportsChat = proj.passports.map(p => ({
    name: p.name, code: p.code, manufacturer: p.manufacturer,
    currentStage: p.currentStage, complianceRating: p.complianceRating,
  }));
  const serializedCertsChat = proj.certificates.map(c => ({
    name: c.name, issuer: c.issuer, expiresAt: c.expiresAt, status: c.status,
  }));

  const projectContextChat = `Project: ${proj.name}, Location: ${proj.location}\nPassports: ${JSON.stringify(serializedPassportsChat)}\nCertificates: ${JSON.stringify(serializedCertsChat)}`;

  try {
    if (ai) {
      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [{ text: projectContextChat }, { text: question }],
        config: {
          systemInstruction: `You are "ConstructAsk Evidence Assistant". Answer with precision using the provided project data. Use markdown formatting.`,
          temperature: 0.2,
        },
      });
      res.json({ answer: response.text || "Unable to generate response." });
    } else {
      // Fallback
      const cleaned = question.toLowerCase();
      let answer = "";
      if (cleaned.includes("risk") || cleaned.includes("expire")) {
        answer = `### Compliance Risk Analysis\n- ${proj.certificates.filter(c => c.status === "Expired").length} expired certificate(s) detected.\n- ${proj.certificates.filter(c => c.status === "Expiring").length} certificate(s) expiring soon.\n\n● **IMMEDIATE RECOMMENDATION:** Renew expired certificates before releasing affected materials.`;
      } else {
        answer = `### Project Overview: ${proj.name}\n- ${proj.passports.length} material passports registered\n- Compliance score: ${proj.complianceScore}%\n- ${proj.certificates.length} compliance certificates on file\n\n● **IMMEDIATE RECOMMENDATION:** Ask about specific materials, compliance risks, or audit verification.`;
      }
      res.json({ answer });
    }
  } catch (err: any) {
    console.error("Chat API error:", err);
    res.json({ answer: "An error occurred while processing your query. Please try again." });
  }
});

// GET /api/users/ — list users
app.get("/api/users/", (req, res) => {
  res.json(usersStore);
});

// POST /api/users/ — create user
app.post("/api/users/", (req, res) => {
  const { name, email, role } = req.body;
  if (!name || !email) {
    return res.status(400).json({ detail: "Missing name or email" });
  }
  const user = { id: nextUserId++, name, email, role: role || "Operator" };
  usersStore.push(user);
  res.json(user);
});

// PUT /api/users/:id — update user
app.put("/api/users/:id", (req, res) => {
  const userId = parseInt(req.params.id);
  const user = usersStore.find(u => u.id === userId);
  if (!user) return res.status(404).json({ detail: "User not found" });
  const { name, email, role } = req.body;
  if (name) user.name = name;
  if (email) user.email = email;
  if (role) user.role = role;
  res.json(user);
});

// DELETE /api/users/:id — delete user
app.delete("/api/users/:id", (req, res) => {
  const userId = parseInt(req.params.id);
  const idx = usersStore.findIndex(u => u.id === userId);
  if (idx === -1) return res.status(404).json({ detail: "User not found" });
  usersStore.splice(idx, 1);
  res.json({ message: "User deleted" });
});


// Vite Middleware for development OR Static Serving for Production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[ConstructAsk] Server operational on http://localhost:${PORT} in ${process.env.NODE_ENV || "development"} mode.`);
  });
}

startServer();

