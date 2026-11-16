import { supersetLabels } from '../lib/format';

/** Position of an exercise in a plan day, or A1/A2... when it's part of a superset. */
export default function ExerciseNumber(props) {
  const label = () => supersetLabels(props.exercises.map((e) => e.superset ?? null))[props.index];
  return (
    <span
      class="num w-6 shrink-0 text-[15px] font-semibold"
      classList={{ 'text-accent': !!label(), 'text-label-3': !label() }}
    >
      {label() ?? props.index + 1}
    </span>
  );
}
