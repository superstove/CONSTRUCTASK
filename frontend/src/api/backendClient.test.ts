import assert from "node:assert/strict";
import test from "node:test";

import {
  clearAppSession,
  getProjectBundle,
  listProjects,
  listUsers,
  mapCertificate,
  mapMaterialToPassport,
  mapProjectOption,
  mapScanLog,
} from "./backendClient";

test("maps FastAPI project records to selector options", () => {
  const option = mapProjectOption({
    id: 7,
    name: "NH66 Highway Slope Protection",
    location: "Kerala, India",
    start_date: "2026-01-01",
    end_date: "2026-12-31",
    status: "Active",
    risk_score: "High",
  });

  assert.deepEqual(option, {
    id: "7",
    name: "NH66 Highway Slope Protection",
    location: "Kerala, India",
    manager: "Site Manager",
    risk: "HIGH",
  });
});

test("shares one demo login across concurrent API requests", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map<string, string>();
  const requestedUrls: string[] = [];

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });

  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    requestedUrls.push(href);

    if (href.endsWith("/api/auth/login")) {
      return new Response(JSON.stringify({
        access_token: "demo-token",
        token_type: "bearer",
        user_id: 1,
        name: "Anton Demo",
        role: "Project Manager",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (href.endsWith("/api/projects/")) {
      return new Response(JSON.stringify([{
        id: 24,
        name: "NH66 Highway Slope Protection",
        location: "Kerala, India",
        start_date: "2026-01-01",
        end_date: "2026-12-31",
        status: "Active",
        risk_score: "High",
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (href.endsWith("/api/users/")) {
      return new Response(JSON.stringify([{
        id: 1,
        name: "Anton Demo",
        email: "demo@constructask.dev",
        role: "Project Manager",
      }]), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    clearAppSession();

    await Promise.all([
      listProjects(),
      listUsers(),
    ]);

    assert.equal(
      requestedUrls.filter((url) => url.endsWith("/api/auth/login")).length,
      1
    );
  } finally {
    clearAppSession();
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});

test("loads project startup data from the backend bundle endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalLocalStorage = globalThis.localStorage;
  const store = new Map<string, string>();
  const requestedUrls: string[] = [];

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
  });

  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    requestedUrls.push(href);

    if (href.endsWith("/api/auth/login")) {
      return new Response(JSON.stringify({
        access_token: "demo-token",
        token_type: "bearer",
        user_id: 1,
        name: "Anton Demo",
        role: "Project Manager",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (href.endsWith("/api/projects/24/bundle")) {
      return new Response(JSON.stringify({
        project: {
          id: 24,
          name: "NH66 Highway Slope Protection",
          location: "Kerala, India",
          start_date: "2026-01-01",
          end_date: "2026-12-31",
          status: "Active",
          risk_score: "Low",
        },
        dashboard: {
          project: {
            id: 24,
            name: "NH66 Highway Slope Protection",
            location: "Kerala, India",
            start_date: "2026-01-01",
            end_date: "2026-12-31",
            status: "Active",
            risk_score: "Low",
          },
          total_materials: 0,
          pending_approvals: 0,
          expiring_certs: 0,
          total_deliveries: 0,
          ontime_deliveries: 0,
          delayed_deliveries: 0,
          alerts: [],
          reasoning_sources: [],
          workflow_dependencies: [],
          health_timeline: [],
          activity_timeline: [],
          executive_brief: ["No active blockers."],
          risk_confidence: "Low",
          supplier_risks: [],
        },
        readiness: {
          status: "No Materials Yet",
          score: 0,
          blockers: 0,
          warnings: 0,
          reasons: ["No materials have been added."],
          next_action: "Add the project's first material.",
        },
        actions: [],
        materials: [],
        certificates: [],
        approvals: [],
        scans: [],
        passports: [],
        audit_trail: [],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    clearAppSession();

    const bundle = await getProjectBundle(24);

    assert.equal(bundle.project.name, "NH66 Highway Slope Protection");
    assert.equal(
      requestedUrls.filter((url) => url.endsWith("/api/projects/24/bundle")).length,
      1
    );
    assert.equal(
      requestedUrls.some((url) => url.includes("/api/projects/24/dashboard")),
      false
    );
  } finally {
    clearAppSession();
    globalThis.fetch = originalFetch;
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: originalLocalStorage,
    });
  }
});

test("maps materials and linked certificate names into product passports", () => {
  const passport = mapMaterialToPassport(
    {
      id: 3,
      project_id: 1,
      name: "High-Tensile Anchor Rod",
      supplier: "SlopeSecure India",
      batch_number: "NH66-AR-18",
      qr_code: "QR-NH66-AR-18",
      status: "verified",
      quantity: 260,
      unit: "units",
    },
    { name: "NH66 Highway", location: "Kerala" },
    [{ material_id: 3, certificate_name: "IS 16014 Steel Certificate" }],
    []
  );

  assert.equal(passport.id, "3");
  assert.equal(passport.code, "NH66-AR-18");
  assert.equal(passport.manufacturer, "SlopeSecure India");
  assert.equal(passport.currentStage, "Verified");
  assert.deepEqual(passport.standards, ["IS 16014 Steel Certificate"]);
  assert.equal(passport.qrPayload, "QR-NH66-AR-18");
});

test("maps certificate and scan records into current frontend shapes", () => {
  const certificate = mapCertificate({
    id: 5,
    material_id: 3,
    certificate_name: "Material Compatibility Report",
    issuing_body: "BuildChem QA Lab",
    issue_date: "2025-01-01",
    expiry_date: "2025-03-22",
    status: "expired",
    material_name: "Cementitious Slope Protection Mat",
    days_until_expiry: -10,
  });

  assert.equal(certificate.id, "5");
  assert.equal(certificate.name, "Material Compatibility Report");
  assert.equal(certificate.status, "Expired");
  assert.equal(certificate.scope, "Cementitious Slope Protection Mat");

  const scan = mapScanLog({
    id: 9,
    material_id: 3,
    project_id: 1,
    scanned_by: "Asha Thomas",
    scan_time: "2026-06-04T08:00:00",
    location: "Chainage 42+300",
    scan_type: "confirm_use",
    result: "passed",
    material_name: "High-Tensile Anchor Rod",
  });

  assert.equal(scan.id, "9");
  assert.equal(scan.productName, "High-Tensile Anchor Rod");
  assert.equal(scan.productCode, "MAT-3");
  assert.equal(scan.status, "Verified");
});
