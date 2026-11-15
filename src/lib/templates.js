// Starter programmes offered when creating a plan.
const ex = (exercise_name, target_sets, target_reps_min, target_reps_max = target_reps_min) => ({
  exercise_name,
  target_sets,
  target_reps_min,
  target_reps_max,
});

export const PLAN_TEMPLATES = [
  {
    name: 'Full Body 3×',
    description: 'Three full-body sessions a week, alternating A and B.',
    days: [
      {
        name: 'Full Body A',
        exercises: [
          ex('Squat', 3, 5, 8),
          ex('Bench Press', 3, 5, 8),
          ex('Barbell Row', 3, 8, 10),
          ex('Plank', 3, 30, 60),
        ],
      },
      {
        name: 'Full Body B',
        exercises: [
          ex('Deadlift', 3, 3, 5),
          ex('Overhead Press', 3, 6, 8),
          ex('Pull-up', 3, 5, 10),
          ex('Lunge', 3, 8, 12),
        ],
      },
    ],
  },
  {
    name: 'Upper / Lower',
    description: 'Four days: upper and lower body, twice each.',
    days: [
      {
        name: 'Upper A',
        exercises: [
          ex('Bench Press', 4, 5, 8),
          ex('Barbell Row', 4, 6, 10),
          ex('Overhead Press', 3, 8, 10),
          ex('Bicep Curl', 3, 10, 15),
        ],
      },
      {
        name: 'Lower A',
        exercises: [
          ex('Squat', 4, 5, 8),
          ex('Romanian Deadlift', 3, 8, 10),
          ex('Leg Press', 3, 10, 12),
          ex('Calf Raise', 3, 12, 15),
        ],
      },
      {
        name: 'Upper B',
        exercises: [
          ex('Incline Dumbbell Press', 4, 8, 10),
          ex('Pull-up', 4, 6, 10),
          ex('Lateral Raise', 3, 12, 15),
          ex('Tricep Pushdown', 3, 10, 15),
        ],
      },
      {
        name: 'Lower B',
        exercises: [
          ex('Deadlift', 3, 3, 5),
          ex('Front Squat', 3, 6, 8),
          ex('Leg Curl', 3, 10, 12),
          ex('Hanging Leg Raise', 3, 10, 15),
        ],
      },
    ],
  },
  {
    name: 'Push / Pull / Legs',
    description: 'Classic three-way split. Run it once or twice a week.',
    days: [
      {
        name: 'Push',
        exercises: [
          ex('Bench Press', 4, 5, 8),
          ex('Overhead Press', 3, 6, 10),
          ex('Incline Dumbbell Press', 3, 8, 12),
          ex('Tricep Pushdown', 3, 10, 15),
        ],
      },
      {
        name: 'Pull',
        exercises: [
          ex('Deadlift', 3, 3, 5),
          ex('Pull-up', 4, 6, 10),
          ex('Barbell Row', 3, 8, 10),
          ex('Bicep Curl', 3, 10, 15),
        ],
      },
      {
        name: 'Legs',
        exercises: [
          ex('Squat', 4, 5, 8),
          ex('Romanian Deadlift', 3, 8, 10),
          ex('Leg Press', 3, 10, 12),
          ex('Calf Raise', 4, 12, 15),
        ],
      },
    ],
  },
];
