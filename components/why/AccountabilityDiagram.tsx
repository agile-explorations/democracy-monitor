import { WHY_PILLARS } from '@/lib/data/why-this-matters';

/**
 * The "machine of accountable power" (#550): an SVG map of the six pillars
 * around a center node. Navigation, not data — clicking a pillar scrolls to
 * its card below, so the page degrades to the card layout without the
 * diagram adding or hiding any content. Theme-aware via dm-* class tokens.
 */

const VIEW_W = 680;
const VIEW_H = 460;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const RING_X = 235;
const RING_Y = 165;
const NODE_W = 164;
const NODE_H = 52;
const CENTER_R = 68;

/** Node centers on an ellipse, starting at 12 o'clock. */
function nodePosition(index: number, count: number): { x: number; y: number } {
  const angle = -Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { x: CX + RING_X * Math.cos(angle), y: CY + RING_Y * Math.sin(angle) };
}

function scrollToPillar(event: React.MouseEvent, id: string) {
  const target = document.getElementById(id);
  if (!target) return; // fall through to native anchor navigation
  event.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}

export function AccountabilityDiagram() {
  const positions = WHY_PILLARS.map((_, i) => nodePosition(i, WHY_PILLARS.length));

  return (
    <figure
      className="hidden sm:block max-w-3xl mb-8"
      aria-label="How the six pillars connect to accountable power"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto"
        role="img"
        aria-labelledby="accountability-diagram-title"
      >
        <title id="accountability-diagram-title">
          Six groups of checks, all holding the same center: power that can be held accountable.
        </title>

        {/* Spokes (behind everything) */}
        {positions.map((pos, i) => (
          <line
            key={WHY_PILLARS[i].id}
            x1={CX}
            y1={CY}
            x2={pos.x}
            y2={pos.y}
            className="stroke-dm-border"
            strokeWidth={1.5}
          />
        ))}

        {/* Center node */}
        <circle
          cx={CX}
          cy={CY}
          r={CENTER_R}
          className="fill-dm-card stroke-dm-accent"
          strokeWidth={2}
        />
        <text
          x={CX}
          y={CY - 8}
          textAnchor="middle"
          className="fill-dm-text-primary text-[15px] font-bold"
        >
          Power held
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          className="fill-dm-text-primary text-[15px] font-bold"
        >
          accountable
        </text>
        <text x={CX} y={CY + 32} textAnchor="middle" className="fill-dm-muted text-[10px]">
          whoever holds it
        </text>

        {/* Pillar nodes */}
        {WHY_PILLARS.map((pillar, i) => {
          const { x, y } = positions[i];
          const count = pillar.categoryKeys.length;
          return (
            <a
              key={pillar.id}
              href={`#${pillar.id}`}
              onClick={(e) => scrollToPillar(e, pillar.id)}
              aria-label={`${pillar.question} Jump to details.`}
              className="group cursor-pointer focus:outline-none"
            >
              <title>{pillar.question}</title>
              <rect
                x={x - NODE_W / 2}
                y={y - NODE_H / 2}
                width={NODE_W}
                height={NODE_H}
                rx={10}
                className="fill-dm-card stroke-dm-border group-hover:stroke-dm-accent group-focus:stroke-dm-accent transition-colors"
                strokeWidth={1.5}
              />
              <text
                x={x}
                y={y - 2}
                textAnchor="middle"
                className="fill-dm-text-primary text-[13px] font-semibold group-hover:fill-dm-accent group-focus:fill-dm-accent transition-colors"
              >
                {pillar.shortLabel}
              </text>
              <text x={x} y={y + 15} textAnchor="middle" className="fill-dm-muted text-[10px]">
                {count} {count === 1 ? 'category' : 'categories'} &darr;
              </text>
            </a>
          );
        })}
      </svg>
      <figcaption className="text-sm text-dm-muted mt-1 text-center">
        Every pillar holds the same center. Click one to see how — and what it looks like when it
        gives way.
      </figcaption>
    </figure>
  );
}
