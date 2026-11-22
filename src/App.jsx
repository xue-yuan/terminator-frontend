import { Show } from 'solid-js';
import { MemoryRouter, Navigate, Route } from '@solidjs/router';
import { isSignedIn } from './lib/auth';
import { createAppHistory } from './lib/nav';
import AppLayout, { UpdatePrompt } from './components/Layout';
import TitleGift from './components/TitleGift';
import { Toaster } from './components/ui';
import { watchUnlocks } from './lib/unlocks';
import Achievements from './pages/Achievements';
import Admin from './pages/Admin';
import Body from './pages/Body';
import Calendar from './pages/Calendar';
import ExerciseDetail from './pages/ExerciseDetail';
import Exercises from './pages/Exercises';
import History from './pages/History';
import Library from './pages/Library';
import Home from './pages/Home';
import Login from './pages/Login';
import Muscles from './pages/Muscles';
import PlanDetail from './pages/PlanDetail';
import PlanEditor from './pages/PlanEditor';
import Plans from './pages/Plans';
import Profile from './pages/Profile';
import Session from './pages/Session';
import SpotifyDone from './pages/SpotifyDone';
import WorkoutDetail from './pages/WorkoutDetail';

function RequireAuth(props) {
  return (
    <Show when={isSignedIn()} fallback={<Navigate href="/login" />}>
      <AppLayout>{props.children}</AppLayout>
    </Show>
  );
}

function GuestOnly() {
  return (
    <Show when={!isSignedIn()} fallback={<Navigate href="/" />}>
      <Login />
    </Show>
  );
}

// The app's own page stack, so the browser has no pages to swipe between (lib/nav.js).
const appHistory = createAppHistory();
// New titles get a word, wherever you are (lib/unlocks.js).
watchUnlocks();

export default function App() {
  return (
    <MemoryRouter
      history={appHistory}
      root={(props) => (
        <>
          {props.children}
          <Toaster />
          <UpdatePrompt />
          <TitleGift />
        </>
      )}
    >
      <Route path="/login" component={GuestOnly} />
      {/* Signed in or not: the end of a Spotify sign-in (maybe in another browser). */}
      <Route path="/spotify/done" component={SpotifyDone} />
      <Route path="/" component={RequireAuth}>
        <Route path="/" component={Home} />
        <Route path="/session" component={Session} />
        <Route path="/muscles" component={Muscles} />
        <Route path="/history" component={History} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/workouts/:id" component={WorkoutDetail} />
        <Route path="/exercises" component={Exercises} />
        <Route path="/exercises/:id" component={ExerciseDetail} />
        <Route path="/plans" component={Plans} />
        <Route path="/plans/new" component={PlanEditor} />
        <Route path="/plans/:id" component={PlanDetail} />
        <Route path="/plans/:id/edit" component={PlanEditor} />
        <Route path="/profile" component={Profile} />
        <Route path="/achievements" component={Achievements} />
        <Route path="/body" component={Body} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/library" component={Library} />
        <Route path="*" component={() => <Navigate href="/" />} />
      </Route>
    </MemoryRouter>
  );
}
