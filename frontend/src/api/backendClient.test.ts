import assert from "node:assert/strict";
import test from "node:test";

import {
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
