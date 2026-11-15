import { supersetLabels } from '../lib/format';

/** Position of an exercise in a plan day, or A1/A2... when it's part of a superset. */
export default function ExerciseNumber(props) {
  const label = () => supersetLabels(props.exercises.map((e) => e.superset ?? null))[props.index];
  return (
    <span class="display w-6 shrink-0" classList={{ 'text-signal': !!label(), 'text-muted': !label() }}>
      {label() ?? props.index + 1}
    </span>
  );
}
