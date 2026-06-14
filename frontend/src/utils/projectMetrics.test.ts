import assert from "node:assert/strict";
import test from "node:test";

import { calculateDppMetrics } from "./projectMetrics";
import { ComplianceCertificate, ProductPassport } from "../types";

test("calculates DPP metrics from passports and certificates", () => {
  const passports = [
    { id: "1", auditChain: [{ index: 0 }, { index: 1 }], currentStage: "Verified" },
    { id: "2", auditChain: [{ index: 0 }], currentStage: "Delivered" },
    { id: "3", auditChain: [{ index: 0 }, { index: 1 }], currentStage: "Verified" },
  ] as ProductPassport[];

  const certificates = [
    { id: "1", status: "Active" },
    { id: "2", status: "Expiring" },
    { id: "3", status: "Expired" },
  ] as ComplianceCertificate[];

  const metrics = calculateDppMetrics(passports, certificates);

  assert.equal(metrics.activeDppCount, 3);
  // All 3 passports have a non-empty audit chain, so trace coverage is 100%.
  assert.equal(metrics.traceCoverage, 100);
  assert.equal(metrics.complianceLevel, 33);
  // 2 of 3 passports are at a verified-or-later stage → 67%.
  assert.equal(metrics.verifiedPassportLevel, 67);
});
