import { Activity, Anchor, MapPin, Route, ScanLine } from "lucide-react";

export default function CivilSiteVisual({ projectName = "Active project", compact = false }) {
  return (
    <figure className={`site-visual ${compact ? "compact" : ""}`} aria-label="Civil engineering site intelligence visual">
      <div className="site-visual-top">
        <div>
          <strong>{projectName}</strong>
          <span>Live construction evidence map</span>
        </div>
        <div className="site-live">
          <Activity size={15} />
          Synced
        </div>
      </div>

      <div className="terrain-stage">
        <div className="contour contour-a" />
        <div className="contour contour-b" />
        <div className="contour contour-c" />
        <div className="cut-slope" />
        <div className="retention-bench" />
        <div className="drainage-line" />
        <div className="route-line">
          <Route size={15} />
          <span>Chainage 42+300</span>
        </div>
        <div className="anchor-row anchor-row-one">
          <Anchor size={13} />
          <span />
          <span />
          <span />
        </div>
        <div className="anchor-row anchor-row-two">
          <Anchor size={13} />
          <span />
          <span />
          <span />
        </div>
        <div className="scan-marker marker-one">
          <ScanLine size={14} />
        </div>
        <div className="scan-marker marker-two">
          <MapPin size={14} />
        </div>
      </div>

      <figcaption className="site-legend">
        <span>QR scans</span>
        <span>Approvals</span>
        <span>Certificates</span>
      </figcaption>
    </figure>
  );
}
