/**
 * Disclosure chevron for expand/collapse controls. The 10px unicode
 * triangles used previously were too small to read as controls
 * (owner feedback 2026-07-26); every toggle shares this SVG so sizing
 * and rotation stay consistent app-wide.
 *
 * `open` points the chevron down (content shown); closed rotates it
 * -90° (pointing right). Inherits currentColor.
 */
export function Chevron({
  open,
  className = 'w-3.5 h-3.5',
}: {
  open: boolean;
  className?: string;
}) {
  return (
    <svg
      className={`${className} shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
