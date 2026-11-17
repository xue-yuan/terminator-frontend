import { Show } from 'solid-js';
import { Navigate, Route, Router } from '@solidjs/router';
import { isSignedIn } from './lib/auth';
import AppLayout, { UpdatePrompt } from './components/Layout';
import { Toaster } from './components/ui';
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

export default function App() {
  return (
    <Router
      scrollRestoration
      root={(props) => (
        <>
          {props.children}
          <Toaster />
          <UpdatePrompt />
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
        <Route path="/body" component={Body} />
        <Route path="/admin" component={Admin} />
        <Route path="/admin/library" component={Library} />
        <Route path="*" component={() => <Navigate href="/" />} />
      </Route>
    </Router>
  );
}
