function SkeletonBlock({ className = "" }) {
  return <span className={`skeleton-block ${className}`} />;
}

export default function SkeletonCards({ type = "panel", count = 3, className = "" }) {
  return (
    <div className={`skeleton-set skeleton-${type} ${className}`} aria-label="Loading content">
      {Array.from({ length: count }).map((_, index) => (
        <div className="skeleton-card" key={index}>
          {type === "stat" ? (
            <>
              <SkeletonBlock className="skeleton-icon" />
              <SkeletonBlock className="skeleton-line short" />
              <SkeletonBlock className="skeleton-number" />
              <SkeletonBlock className="skeleton-line" />
            </>
          ) : type === "row" ? (
            <>
              <SkeletonBlock className="skeleton-dot" />
              <div>
                <SkeletonBlock className="skeleton-line" />
                <SkeletonBlock className="skeleton-line short" />
              </div>
              <SkeletonBlock className="skeleton-pill" />
            </>
          ) : (
            <>
              <SkeletonBlock className="skeleton-line short" />
              <SkeletonBlock className="skeleton-title" />
              <SkeletonBlock className="skeleton-line" />
              <SkeletonBlock className="skeleton-line medium" />
            </>
          )}
        </div>
      ))}
    </div>
  );
}
