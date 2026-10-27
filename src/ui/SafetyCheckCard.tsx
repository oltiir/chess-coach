export const SAFETY_QUESTIONS = [
  'What did their last move attack?',
  'After my move: what checks, captures or threats do they have?',
  'Is anything of theirs hanging?',
];

export function SafetyCheckCard({ compact = false }: { compact?: boolean }) {
  return (
    <section class={`card safety ${compact ? 'compact' : ''}`} aria-labelledby="safety-title">
      <h2 id="safety-title">Before every move</h2>
      <ol>
        {SAFETY_QUESTIONS.map((q) => <li key={q}>{q}</li>)}
      </ol>
    </section>
  );
}
