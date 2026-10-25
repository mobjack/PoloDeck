import type { CardsBySide, TeamSide } from "../lib/cards";

interface CardMarksProps {
  yellows: number;
  reds: number;
}

const STAFF_ROWS = [
  ["HEAD_COACH", "Head coach"],
  ["ASSISTANT_COACH", "Assistant"],
  ["BENCH", "Bench"],
] as const;

/** Small card icons beside a name. Two yellows means the second yellow rolled the player. */
export function CardMarks({ yellows, reds }: CardMarksProps) {
  const yellowCount = Math.min(2, Math.max(0, yellows));
  const showRed = reds > 0;
  if (yellowCount === 0 && !showRed) return null;
  const label = [
    yellowCount === 1 ? "1 yellow card" : yellowCount === 2 ? "2 yellow cards" : "",
    showRed ? "red card" : "",
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span className="card-marks" aria-label={label} title={label}>
      {Array.from({ length: yellowCount }, (_, index) => (
        <span key={`y${index}`} className="card-mark card-mark--yellow" />
      ))}
      {showRed ? <span className="card-mark card-mark--red" /> : null}
    </span>
  );
}

/** Coach and bench cards sit on the team, not on a cap row. A red card marks that person out. */
export function StaffCardLine({ cards, side }: { cards: CardsBySide; side: TeamSide }) {
  const staff = cards.staff[side];
  const visible = STAFF_ROWS.filter(([key]) => {
    const tally = staff[key];
    return tally.yellow > 0 || tally.red > 0 || tally.yellowRed > 0;
  });
  if (visible.length === 0) return null;
  return (
    <p className="roster-staff-cards">
      {visible.map(([key, label]) => {
        const tally = staff[key];
        return (
          <span
            key={key}
            className={
              tally.red > 0 ? "roster-staff-card roster-staff-card--out" : "roster-staff-card"
            }
          >
            <span className="roster-staff-card-label">{label}</span>
            <CardMarks
              yellows={tally.yellow + tally.yellowRed}
              reds={tally.red + tally.yellowRed}
            />
          </span>
        );
      })}
    </p>
  );
}
