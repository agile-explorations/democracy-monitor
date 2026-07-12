import { WHY_PILLARS } from '@/lib/data/why-this-matters';

/**
 * The pillars of accountable power (#550): a temple diagram — six slender
 * columns holding up a beam labeled "Power held accountable", labels on the
 * ground beneath each column. Navigation, not data: clicking a column (or
 * its label) scrolls to its pillar card below, so the page degrades to the
 * card layout untouched. Theme-aware via dm-* class tokens.
 */

const VIEW_W = 680;
const VIEW_H = 300;
const MARGIN_X = 20;
const PEDIMENT_APEX_Y = 8;
const BEAM_Y = 36;
const BEAM_H = 42;
const CAPITAL_H = 8;
const CAPITAL_W = 52;
const SHAFT_TOP = BEAM_Y + BEAM_H + CAPITAL_H;
const SHAFT_H = 126;
const SHAFT_TOP_W = 30;
const SHAFT_BOTTOM_W = 38;
const BASE_H = 8;
const FLOOR_Y = SHAFT_TOP + SHAFT_H + BASE_H + 2;
const LABEL_TOP = FLOOR_Y + 24;
/** Fixed baseline so counts align across 1- and 2-line labels. */
const COUNT_Y = LABEL_TOP + 2 * 16 + 13;

const SLOT_W = (VIEW_W - 2 * MARGIN_X) / WHY_PILLARS.length;

/** Split a label into at most two lines, breaking at the space nearest the middle. */
function wrapLabel(label: string): string[] {
  if (label.length <= 10 || !label.includes(' ')) return [label];
  const middle = label.length / 2;
  let breakAt = -1;
  for (let i = 0; i < label.length; i++) {
    if (label[i] === ' ' && (breakAt === -1 || Math.abs(i - middle) < Math.abs(breakAt - middle))) {
      breakAt = i;
    }
  }
  return [label.slice(0, breakAt), label.slice(breakAt + 1)];
}

function scrollToPillar(event: React.MouseEvent, id: string) {
  const target = document.getElementById(id);
  if (!target) return; // fall through to native anchor navigation
  event.preventDefault();
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  history.replaceState(null, '', `#${id}`);
}

function Column({ index }: { index: number }) {
  const pillar = WHY_PILLARS[index];
  const cx = MARGIN_X + SLOT_W * index + SLOT_W / 2;
  const count = pillar.categoryKeys.length;
  const lines = wrapLabel(pillar.shortLabel);
  const shaftBottom = SHAFT_TOP + SHAFT_H;

  return (
    <a
      href={`#${pillar.id}`}
      onClick={(e) => scrollToPillar(e, pillar.id)}
      aria-label={`${pillar.question} Jump to details.`}
      className="group cursor-pointer focus:outline-none"
    >
      <title>{pillar.question}</title>
      {/* Full-slot hit target */}
      <rect
        x={cx - SLOT_W / 2}
        y={BEAM_Y + BEAM_H}
        width={SLOT_W}
        height={VIEW_H - BEAM_Y - BEAM_H}
        fill="transparent"
      />
      {/* Capital */}
      <rect
        x={cx - CAPITAL_W / 2}
        y={SHAFT_TOP - CAPITAL_H}
        width={CAPITAL_W}
        height={CAPITAL_H}
        rx={2}
        className="fill-dm-muted/60 group-hover:fill-dm-accent group-focus:fill-dm-accent transition-colors"
      />
      {/* Tapered shaft */}
      <polygon
        points={`${cx - SHAFT_TOP_W / 2},${SHAFT_TOP} ${cx + SHAFT_TOP_W / 2},${SHAFT_TOP} ${cx + SHAFT_BOTTOM_W / 2},${shaftBottom} ${cx - SHAFT_BOTTOM_W / 2},${shaftBottom}`}
        className="fill-dm-muted/40 group-hover:fill-dm-accent/40 group-focus:fill-dm-accent/40 transition-colors"
      />
      {/* Fluting */}
      {[-6, 0, 6].map((dx) => (
        <line
          key={dx}
          x1={cx + dx}
          y1={SHAFT_TOP + 6}
          x2={cx + dx * (SHAFT_BOTTOM_W / SHAFT_TOP_W)}
          y2={shaftBottom - 6}
          className="stroke-dm-bg/70"
          strokeWidth={1.5}
        />
      ))}
      {/* Base */}
      <rect
        x={cx - CAPITAL_W / 2}
        y={shaftBottom}
        width={CAPITAL_W}
        height={BASE_H}
        rx={2}
        className="fill-dm-muted/60 group-hover:fill-dm-accent group-focus:fill-dm-accent transition-colors"
      />
      {/* Label beneath the floor */}
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={(lines.length === 1 ? LABEL_TOP + 8 : LABEL_TOP) + i * 16}
          textAnchor="middle"
          className="fill-dm-text-primary text-[13px] font-semibold group-hover:fill-dm-accent group-focus:fill-dm-accent transition-colors"
        >
          {line}
        </text>
      ))}
      <text x={cx} y={COUNT_Y} textAnchor="middle" className="fill-dm-muted text-[10px]">
        {count} {count === 1 ? 'category' : 'categories'} &darr;
      </text>
    </a>
  );
}

export function AccountabilityDiagram() {
  return (
    <figure
      className="hidden sm:block max-w-3xl mb-8"
      aria-label="Six pillars holding up accountable power"
    >
      <svg
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        className="w-full h-auto"
        role="img"
        aria-labelledby="accountability-diagram-title"
      >
        <title id="accountability-diagram-title">
          Six pillars of checks, all holding up the same thing: power that can be held accountable.
        </title>

        {/* Pediment */}
        <polygon
          points={`${MARGIN_X + 6},${BEAM_Y} ${VIEW_W - MARGIN_X - 6},${BEAM_Y} ${VIEW_W / 2},${PEDIMENT_APEX_Y}`}
          className="fill-dm-muted/50"
        />
        {/* Beam */}
        <rect
          x={MARGIN_X}
          y={BEAM_Y}
          width={VIEW_W - 2 * MARGIN_X}
          height={BEAM_H}
          rx={4}
          className="fill-dm-card stroke-dm-accent"
          strokeWidth={2}
        />
        <text
          x={VIEW_W / 2}
          y={BEAM_Y + 20}
          textAnchor="middle"
          className="fill-dm-text-primary text-[15px] font-bold"
        >
          Power held accountable
        </text>
        <text
          x={VIEW_W / 2}
          y={BEAM_Y + 35}
          textAnchor="middle"
          className="fill-dm-muted text-[10px]"
        >
          whoever holds it
        </text>

        {/* Columns */}
        {WHY_PILLARS.map((_, i) => (
          <Column key={WHY_PILLARS[i].id} index={i} />
        ))}

        {/* Floor (stylobate) */}
        <rect
          x={MARGIN_X - 8}
          y={FLOOR_Y - 2}
          width={VIEW_W - 2 * MARGIN_X + 16}
          height={6}
          rx={2}
          className="fill-dm-muted/60"
        />
      </svg>
      <figcaption className="text-sm text-dm-muted mt-1 text-center">
        Every pillar holds up the same thing. Click one to see how — and what it looks like when it
        gives way.
      </figcaption>
    </figure>
  );
}
