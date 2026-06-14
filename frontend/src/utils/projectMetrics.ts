import { ComplianceCertificate, ProductPassport } from "../types";

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function calculateDppMetrics(
  passports: ProductPassport[],
  certificates: ComplianceCertificate[]
) {
  const activeDppCount = passports.length;
  const tracedPassports = passports.filter((passport) => passport.auditChain.length > 0).length;
  const activeCertificates = certificates.filter((certificate) => certificate.status === "Active").length;
  const verifiedPassports = passports.filter((passport) =>
    ["Verified", "Audited", "Installed"].includes(passport.currentStage)
  ).length;

  return {
    activeDppCount,
    traceCoverage: percent(tracedPassports, activeDppCount),
    complianceLevel: percent(activeCertificates, certificates.length),
    verifiedPassportLevel: percent(verifiedPassports, activeDppCount),
  };
}
