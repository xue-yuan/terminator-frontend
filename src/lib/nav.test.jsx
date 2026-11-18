// @vitest-environment happy-dom
import { createEffect, on, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import { A, MemoryRouter, Navigate, Route, useLocation } from '@solidjs/router';
import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createAppHistory, markStart, useArrivals, useBack } from './nav';

const tick = () => new Promise((r) => setTimeout(r, 10));
let dispose;
let arrivals;

function Shell(props) {
  const location = useLocation();
  const arrival = useArrivals();
  onMount(markStart);
  createEffect(
    on(
      () => location.pathname,
      () => arrivals.push(arrival()),
      { defer: true },
    ),
  );
  return props.children;
}

function Page(props) {
  const back = useBack();
  return (
    <>
      <A href={props.next}>next</A>
      <button type="button" onClick={() => back('/list')}>
        back
      </button>
    </>
  );
}

function mount(path) {
  window.history.replaceState(null, '', path);
  const root = document.createElement('div');
  document.body.append(root);
  dispose = render(
    () => (
      <MemoryRouter history={createAppHistory()} root={Shell}>
        <Route path="/list" component={() => <Page next="/list/1" />} />
        <Route path="/list/:id" component={() => <Page next="/list/2" />} />
        <Route path="/old" component={() => <Navigate href="/list" />} />
      </MemoryRouter>
    ),
    root,
  );
}
const tap = async (text) => {
  [...document.querySelectorAll('a, button')].find((el) => el.textContent === text).click();
  await tick();
};

beforeEach(() => (arrivals = []));
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
});

describe('the app page stack', () => {
  it('moves between pages without adding browser history to swipe through', async () => {
    mount('/list');
    const length = window.history.length;
    window.scrollTo(0, 300);
    window.dispatchEvent(new Event('scroll'));

    await tap('next');
    expect(location.pathname).toBe('/list/1');
    await tap('next');
    expect(location.pathname).toBe('/list/2');
    expect(window.history.length).toBe(length);
    expect(arrivals).toEqual(['push', 'push']);

    await tap('back');
    await tap('back');
    expect(location.pathname).toBe('/list');
    expect(window.scrollY).toBe(300); // where the list was left
    expect(window.history.length).toBe(length);
    expect(arrivals).toEqual(['push', 'push', 'pop', 'pop']);
  });

  it('goes up to the fallback when there is no page to go back to', async () => {
    mount('/list/7');
    await tap('back');
    expect(location.pathname).toBe('/list');
    expect(arrivals).toEqual(['pop']);
    // It took the page's place: nothing to go back to from here either.
    await tap('back');
    expect(location.pathname).toBe('/list');
  });

  it('does not treat a redirect as a push', async () => {
    mount('/old');
    await tick();
    expect(location.pathname).toBe('/list');
    await tap('next');
    expect(arrivals.at(-1)).toBe('push');
    expect(arrivals.slice(0, -1).every((kind) => kind == null)).toBe(true);
  });
});
