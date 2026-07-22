// Small red count badge for a dashboard section that has its own share of
// today's due items — e.g. Goals shows its own count, Finances shows its own
// bill count, so a total of 3 due today (2 tasks + 1 goal) isn't just one
// lump number, each contributing section lights up with its own share.
// Reuses the same visual language as the nav badge (Sidebar/TabBar) so it
// reads as "the same kind of thing," just scoped to one section.
export function DueBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="navbadge navbadge--inline dash-due-badge" aria-label={`${count} due today`}>
      {count > 99 ? "99+" : count}
    </span>
  );
}
