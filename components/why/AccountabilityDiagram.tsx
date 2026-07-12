import { WHY_PILLARS } from '@/lib/data/why-this-matters';

/**
 * The pillars of accountable power (#550): a temple diagram — six columns
 * holding up a beam labeled "Power held accountable". Navigation, not data:
 * clicking a column scrolls to its pillar card below, so the page degrades
 * to the card layout untouched. Theme-aware via dm-* class tokens.
 */

const VIEW_W = 680;
const VIEW_H = 262;
const MARGIN_X = 20;
const BEAM_Y = 36;
const BEAM_H = 48;
const PEDIMENT_APEX_Y = 6;
const CAPITAL_H = 8;
const SHAFT_TOP = BEAM_Y + BEAM_H + CAPITAL_H;
const SHAFT_H = 148;
const SHAFT_W = 92;
const CAPITAL_W = 102;
const FLOOR_Y = SHAFT_TOP + SHAFT_H + CAPITAL_H;

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
  const labelBaseY = SHAFT_TOP + (lines.length === 1 ? 64 : 54);

  return (
    <a
      href={`#${pillar.id}`}
      onClick={(e) => scrollToPillar(e, pillar.id)}
      aria-label={`${pillar.question} Jump to details.`}
      className="group cursor-pointer focus:outline-none"
    >
      <title>{pillar.question}</title>
      {/* Capital and base */}
      <rect
        x={cx - CAPITAL_W / 2}
        y={SHAFT_TOP - CAPITAL_H}
        width={CAPITAL_W}
        height={CAPITAL_H}
        rx={2}
        className="fill-dm-border group-hover:fill-dm-accent/60 group-focus:fill-dm-accent/60 transition-colors"
      />
      <rect
        x={cx - CAPITAL_W / 2}
        y={SHAFT_TOP + SHAFT_H}
        width={CAPITAL_W}
        height={CAPITAL_H}
        rx={2}
        className="fill-dm-border group-hover:fill-dm-accent/60 group-focus:fill-dm-accent/60 transition-colors"
      />
      {/* Shaft */}
      <rect
        x={cx - SHAFT_W / 2}
        y={SHAFT_TOP}
        width={SHAFT_W}
        height={SHAFT_H}
        className="fill-dm-card stroke-dm-border group-hover:stroke-dm-accent group-focus:stroke-dm-accent transition-colors"
        strokeWidth={1.5}
      />
      {lines.map((line, i) => (
        <text
          key={i}
          x={cx}
          y={labelBaseY + i * 17}
          textAnchor="middle"
          className="fill-dm-text-primary text-[13px] font-semibold group-hover:fill-dm-accent group-focus:fill-dm-accent transition-colors"
        >
          {line}
        </text>
      ))}
      <text
        x={cx}
        y={labelBaseY + lines.length * 17 + 14}
        textAnchor="middle"
        className="fill-dm-muted text-[10px]"
      >
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
          points={`${MARGIN_X},${BEAM_Y} ${VIEW_W - MARGIN_X},${BEAM_Y} ${VIEW_W / 2},${PEDIMENT_APEX_Y}`}
          className="fill-dm-border/40"
        />
        {/* Beam */}
        <rect
          x={MARGIN_X}
          y={BEAM_Y}
          width={VIEW_W - 2 * MARGIN_X}
          height={BEAM_H}
          rx={6}
          className="fill-dm-card stroke-dm-accent"
          strokeWidth={2}
        />
        <text
          x={VIEW_W / 2}
          y={BEAM_Y + 22}
          textAnchor="middle"
          className="fill-dm-text-primary text-[15px] font-bold"
        >
          Power held accountable
        </text>
        <text
          x={VIEW_W / 2}
          y={BEAM_Y + 39}
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
          y={FLOOR_Y}
          width={VIEW_W - 2 * MARGIN_X + 16}
          height={6}
          rx={2}
          className="fill-dm-border"
        />
      </svg>
      <figcaption className="text-sm text-dm-muted mt-1 text-center">
        Every pillar holds up the same thing. Click one to see how — and what it looks like when it
        gives way.
      </figcaption>
    </figure>
  );
}
