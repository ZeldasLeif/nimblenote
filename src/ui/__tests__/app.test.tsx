// End-to-end smoke test of the real screen: renders App, types commands, presses Enter.
// Storage runs on node:sqlite; native modules are mocked by jest-expo.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

// Minimal Reanimated stand-in: layout animations become no-ops, Animated.View is a View.
jest.mock('react-native-reanimated', () => {
  const RN = require('react-native');
  const anim: Record<string, unknown> = {};
  const chain = () => anim;
  Object.assign(anim, { duration: chain, reduceMotion: chain, delay: chain });
  const passthrough = (C: unknown) => C;
  return {
    __esModule: true,
    default: { View: RN.View, Text: RN.Text, ScrollView: RN.ScrollView, createAnimatedComponent: passthrough },
    createAnimatedComponent: passthrough,
    FadeIn: anim, FadeOut: anim, FadeInDown: anim, FadeInUp: anim, LinearTransition: anim, SlideInLeft: anim, SlideOutLeft: anim,
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown, _c?: unknown, done?: (finished: boolean) => void) => { done?.(true); return v; },
    withSpring: (v: unknown) => v,
    useEvent: () => () => {},
    setGestureState: () => {},
    interpolate: () => 0,
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const RN = require('react-native');
  return { __esModule: true, default: ({ children }: { children: unknown }) => require('react').createElement(RN.View, null, children) };
});
jest.mock('../../services/appStore', () => {
  const { useSyncExternalStore } = require('react');
  const { Store } = require('../../data/store');
  const { nodeDb, fakeCrypto } = require('../../data/__tests__/nodeDb');
  const store = new Store(nodeDb(), fakeCrypto);
  let p: Promise<void> | null = null;
  return {
    store,
    initStore: () => (p ??= store.init()),
    useAppState: () => useSyncExternalStore(store.subscribe, store.getState),
  };
});

jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
jest.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: (...a: unknown[]) => void, ...args: unknown[]) => fn(...args) }));

import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import App from '../../../App';

const input = () => screen.getByLabelText('Command input');

async function type(text: string) {
  await fireEvent.changeText(input(), text);
}
async function enter() {
  await fireEvent(input(), 'submitEditing');
}

describe('App', () => {
  it('shows the centered title and a focused-ready input, then runs the core flows', async () => {
    await render(<App />);
    expect(screen.getByText('NimbleNote')).toBeTruthy();
    await waitFor(() => expect(require('../../services/appStore').store.getState().ready).toBe(true));

    // Write preview, then Enter
    await type('+ groceries eggs, milk, olive oil');
    expect(screen.getByText(/New list “groceries”: add 3 items/)).toBeTruthy();
    await enter();
    await waitFor(() => expect(screen.getByText('olive oil')).toBeTruthy());
    expect(screen.getByText('Added 3 to groceries')).toBeTruthy();

    // No sticky "add to" mode: the input is a normal command line again
    expect(screen.getByPlaceholderText('search · + to save · 5+5 · help')).toBeTruthy();

    // "add to <list>" with amounts in their own column
    await type('add to groceries toilet paper, flour:1kg');
    expect(screen.getByText(/groceries: add 2 items “toilet paper”, “flour” \(1kg\)/)).toBeTruthy();
    await enter();
    await waitFor(() => expect(screen.getByText('toilet paper')).toBeTruthy());
    expect(screen.getByText('1kg')).toBeTruthy();

    // Undo from the toast
    await fireEvent.press(screen.getByText('Undo'));
    await waitFor(() => expect(screen.queryByText('toilet paper')).toBeNull());

    // Calculator evaluates live; Enter replaces the input with the result
    await type('5+5');
    expect(screen.getByText('= 10')).toBeTruthy();
    await enter();
    expect(input().props.value).toBe('10');

    // Where's-what
    await type('+ keys sofa');
    expect(screen.getByText('↵ keys is now at “sofa”')).toBeTruthy();
    await enter();
    await waitFor(() => expect(screen.getAllByText('sofa').length).toBeGreaterThan(0));
    await fireEvent.press(screen.getByLabelText('NimbleNote, back to search'));

    // Live answer card: centered title + labelled line
    await type('where are my keys?');
    await waitFor(() => expect(screen.getByText('Location: sofa · just now')).toBeTruthy());
    expect(screen.getByText('keys')).toBeTruthy();

    // Swipe the card left: it is thrown away (not deleted) and stays away for this query
    await act(async () => { fireGestureHandler(getByGestureTestId('swipe-away'), [
      { translationX: 0, velocityX: 0 }, { translationX: -60, velocityX: -900 }, { translationX: -160, velocityX: -1200 },
    ]); });
    await waitFor(() => expect(screen.queryByText('Location: sofa · just now')).toBeNull());
    expect(require('../../services/appStore').store.categoryByKey('key')).toBeTruthy();

    // Enter on a category name opens it
    await type('groceries');
    await enter();
    await waitFor(() => expect(screen.getByText('olive oil')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('NimbleNote, back to search'));

    // Swipe right on the empty home screen: your lists; swipe left: back
    await act(async () => { fireGestureHandler(getByGestureTestId('library-swipe'), [{ translationX: 0 }, { translationX: 40 }, { translationX: 120 }]); });
    await waitFor(() => expect(screen.getByText('Your lists')).toBeTruthy());
    await act(async () => { fireGestureHandler(getByGestureTestId('library-swipe'), [{ translationX: 0 }, { translationX: -40 }, { translationX: -120 }]); });
    await waitFor(() => expect(screen.queryByText('Your lists')).toBeNull());

    // Facts and forgiving reads
    await type('+ dad birthday 12.03.1960');
    await enter();
    await fireEvent.press(screen.getByLabelText('NimbleNote, back to search'));
    await type("when is my dad's birthday?");
    await waitFor(() => expect(screen.getByText('12.03.1960')).toBeTruthy());

    // Notes
    await type('n called landlord');
    expect(screen.getByText('↵ Save note with timestamp')).toBeTruthy();
    await enter();
    await type('n today');
    await enter();
    await waitFor(() => expect(screen.getByText('called landlord')).toBeTruthy());

    // Reserved-name warning in the preview
    await type('+ t eggs');
    expect(screen.getByText(/also a command/)).toBeTruthy();

    // Invalid timer explains itself, no side effect
    await type('t tea');
    expect(screen.getByText(/Timer needs a duration/)).toBeTruthy();

    // Sub-lists: create with a path, add later by name, open the parent from the breadcrumb
    await type('+ recipes/pancakes eggs:2, flour:500g');
    expect(screen.getByText('↵ New list “pancakes” inside “recipes”: add 2 items “eggs” (2), “flour” (500g)')).toBeTruthy();
    await enter();
    await waitFor(() => expect(screen.getByText('in recipes')).toBeTruthy());
    await type('+ pancakes milk:200ml');
    await enter();
    await waitFor(() => expect(screen.getByText('200ml')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Open recipes'));
    await waitFor(() => expect(screen.getByText('3 ›')).toBeTruthy());

    // Settings: theme switch persists
    await type('settings');
    await enter();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());
    await fireEvent.press(screen.getByText('Dark'));
    await waitFor(() => expect(require('../../services/appStore').store.getState().settings.theme).toBe('dark'));

    // Help
    await type('help');
    await enter();
    await waitFor(() => expect(screen.getByText('Grammar')).toBeTruthy());
  });
});
