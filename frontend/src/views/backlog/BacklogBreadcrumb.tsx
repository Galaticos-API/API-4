import { navigate } from "../../models/navigation";

export interface BacklogBreadcrumbSegment {
  label: string;
  path?: string;
}

export function BacklogBreadcrumb({
  segments,
  onNavigate = navigate,
}: {
  segments: BacklogBreadcrumbSegment[];
  onNavigate?: (path: string) => void;
}) {
  return (
    <nav
      className="crumb-bar backlog-breadcrumb"
      aria-label="Caminho do backlog"
    >
      {segments.map((segment, index) => {
        const current =
          index === segments.length - 1;

        return (
          <span
            className="backlog-breadcrumb-segment"
            key={`${segment.label}-${index}`}
          >
            {index > 0 && (
              <span aria-hidden="true">
                →
              </span>
            )}

            {segment.path ? (
              <button
                type="button"
                aria-current={
                  current
                    ? "page"
                    : undefined
                }
                onClick={() =>
                  onNavigate(
                    segment.path!,
                  )
                }
              >
                {segment.label}
              </button>
            ) : (
              <strong
                aria-current={
                  current
                    ? "page"
                    : undefined
                }
              >
                {segment.label}
              </strong>
            )}
          </span>
        );
      })}
    </nav>
  );
}