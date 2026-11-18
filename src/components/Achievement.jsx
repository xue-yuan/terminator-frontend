import { createSignal, onMount, untrack } from 'solid-js';
import { Dynamic } from 'solid-js/web';
import {
  Anchor,
  Apple,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpFromLine,
  Beef,
  BicepsFlexed,
  CalendarCheck,
  CalendarDays,
  CalendarHeart,
  Drumstick,
  Dumbbell,
  Eye,
  Flame,
  Footprints,
  Hourglass,
  Layers,
  LayoutGrid,
  Link2,
  Lock,
  Magnet,
  Moon,
  Mountain,
  MoveHorizontal,
  PartyPopper,
  PersonStanding,
  Plane,
  Rocket,
  RotateCcw,
  Scale,
  Shapes,
  Shield,
  Ship,
  Shirt,
  Star,
  Sunrise,
  Trophy,
  Weight,
  Wheat,
  Zap,
} from 'lucide-solid';
import { reducedMotion } from '../lib/motion';

// The server names each achievement's icon (app/services/achievements.py).
const ICONS = {
  anchor: Anchor,
  apple: Apple,
  'arrow-down-to-line': ArrowDownToLine,
  'arrow-up': ArrowUp,
  'arrow-up-from-line': ArrowUpFromLine,
  beef: Beef,
  'biceps-flexed': BicepsFlexed,
  'calendar-check': CalendarCheck,
  'calendar-days': CalendarDays,
  'calendar-heart': CalendarHeart,
  drumstick: Drumstick,
  dumbbell: Dumbbell,
  eye: Eye,
  flame: Flame,
  footprints: Footprints,
  hourglass: Hourglass,
  layers: Layers,
  'layout-grid': LayoutGrid,
  'link-2': Link2,
  magnet: Magnet,
  moon: Moon,
  mountain: Mountain,
  'move-horizontal': MoveHorizontal,
  'party-popper': PartyPopper,
  'person-standing': PersonStanding,
  plane: Plane,
  rocket: Rocket,
  'rotate-ccw': RotateCcw,
  scale: Scale,
  shapes: Shapes,
  shield: Shield,
  ship: Ship,
  shirt: Shirt,
  star: Star,
  sunrise: Sunrise,
  trophy: Trophy,
  weight: Weight,
  wheat: Wheat,
  zap: Zap,
};

/**
 * A round badge: the achievement's icon on its medal's colour, grey until a
 * tier is reached, a lock while it's a secret. medal, icon, secret, size (px).
 */
export function Badge(props) {
  const size = () => props.size ?? 60;
  return (
    <span
      class="badge shrink-0"
      data-medal={props.medal ?? 'none'}
      style={{ width: `${size()}px`, height: `${size()}px` }}
      aria-hidden="true"
    >
      <Dynamic
        component={props.secret ? Lock : (ICONS[props.icon] ?? Trophy)}
        size={Math.round(size() * 0.46)}
        strokeWidth={2}
      />
    </span>
  );
}

/**
 * Progress through a level as a bar. fraction: 0–1; from: where it starts
 * (0–1), so it fills up from there when it appears (a just-earned gain).
 */
export function XpBar(props) {
  // Whether it starts filled: only the first value of `from` matters.
  const [started, setStarted] = createSignal(untrack(() => props.from == null) || reducedMotion());
  onMount(() => {
    if (!started()) setTimeout(() => setStarted(true), props.delay ?? 600);
  });
  // Once it has filled up, it follows along (more XP arriving moves it on).
  const shown = () => (started() ? props.fraction : props.from);
  return (
    <span class="block h-2 overflow-hidden rounded-full bg-accent-soft" role="presentation">
      <span
        class="block h-full rounded-full bg-accent transition-[width] duration-1000 ease-ios"
        style={{ width: `${Math.max(0, Math.min(1, shown())) * 100}%` }}
      />
    </span>
  );
}
