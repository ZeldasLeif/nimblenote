// End-to-end smoke test of the real screen: renders App, types commands, presses Enter.
// Storage runs on node:sqlite; native modules are mocked by jest-expo.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert, type AlertButton } from 'react-native';

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
const appStore = () => require('../../services/appStore').store;
const title = () => screen.getByLabelText('NimbleNote, back to search');
async function swipeLeft(id: string) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(id), [
      { translationX: 0, velocityX: 0 }, { translationX: -60, velocityX: -900 }, { translationX: -160, velocityX: -1200 },
    ]);
  });
}
async function swipeRight(id: string) {
  await act(async () => { fireGestureHandler(getByGestureTestId(id), [{ translationX: 0 }, { translationX: 40 }, { translationX: 120 }]); });
}
async function tap(id: string) {
  await act(async () => { fireGestureHandler(getByGestureTestId(id)); });
}
/** Long-press drag onto the trash can (its measured rect is the default off-screen one in tests). */
async function dragToTrash(id: string) {
  await act(async () => {
    fireGestureHandler(getByGestureTestId(id), [
      { absoluteX: 200, absoluteY: 400 }, { absoluteX: 100, absoluteY: 100 }, { absoluteX: -1000, absoluteY: -1000 },
    ]);
  });
}

describe('App', () => {
  it('runs the core flows on the real screen', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons?: AlertButton[]) => buttons?.[1]?.onPress?.());
    await render(<App />);
    expect(screen.getByText('NimbleNote')).toBeTruthy();
    await waitFor(() => expect(appStore().getState().ready).toBe(true));

    // Write preview, then Enter: the list is shown, the input stays a normal command line
    await type('+ groceries eggs, milk, olive oil');
    expect(screen.getByText(/New list “groceries”: add 3 items/)).toBeTruthy();
    await enter();
    await waitFor(() => expect(screen.getByText('olive oil')).toBeTruthy());
    expect(screen.getByText('Added 3 to groceries')).toBeTruthy();
    expect(screen.getByPlaceholderText('search · + to save · 5+5 · help')).toBeTruthy();

    // "add to <list>" with amounts in their own column
    await type('add to groceries toilet paper, flour:1kg');
    expect(screen.getByText(/groceries: add 2 items “toilet paper”, “flour” \(1kg\)/)).toBeTruthy();
    expect(screen.queryByText('olive oil')).toBeNull(); // typing replaces what was shown
    await enter();
    await waitFor(() => expect(screen.getByText('1kg')).toBeTruthy());

    // Undo from the toast
    await fireEvent.press(screen.getByText('Undo'));
    await waitFor(() => expect(screen.queryByText('toilet paper')).toBeNull());

    // Drag an item to the trash: asks first, then deletes (undoable)
    const milk = appStore().getState().entries.find((e: { value: string }) => e.value === 'milk');
    await dragToTrash(`entry-${milk.id}-drag`);
    expect(alert).toHaveBeenCalledWith('Remove?', 'Are you sure you want to remove “milk”?', expect.any(Array));
    await waitFor(() => expect(screen.queryByText('milk')).toBeNull());
    expect(screen.getByText('Deleted milk')).toBeTruthy();

    // Tap the title to rename it (display name only)
    await tap('category-title-tap');
    await fireEvent.changeText(screen.getByLabelText('Rename'), 'Shopping');
    await fireEvent(screen.getByLabelText('Rename'), 'submitEditing');
    await waitFor(() => expect(screen.getByText('Shopping')).toBeTruthy());
    expect(appStore().categoryByKey('grocery').name).toBe('Shopping');

    // Swipe left on a list: it leaves the screen, nothing is deleted
    await swipeLeft('stage-swipe');
    await waitFor(() => expect(screen.queryByText('olive oil')).toBeNull());
    expect(appStore().categoryByKey('grocery')).toBeTruthy();

    // Calculator evaluates live; Enter replaces the input with the result
    await type('5+5');
    expect(screen.getByText('= 10')).toBeTruthy();
    await enter();
    expect(input().props.value).toBe('10');

    // Where's-what keeps only the latest location
    await type('+ keys sofa');
    expect(screen.getByText('↵ keys is now at “sofa”')).toBeTruthy();
    await enter();
    await type('+ keys car');
    await enter();
    await waitFor(() => expect(screen.getByText('Location: car · just now')).toBeTruthy());
    expect(screen.queryByText(/sofa/)).toBeNull();
    expect(screen.queryByText(/History/i)).toBeNull();

    // Live answer: title, then "Location: car · just now" on the next line
    await type('where are my keys?');
    await waitFor(() => expect(screen.getByText('Location: car · just now')).toBeTruthy());
    expect(screen.getByText('keys')).toBeTruthy();

    // Swipe the card away: hidden for this query, not deleted
    await swipeLeft('stage-swipe');
    await waitFor(() => expect(screen.queryByText('Location: car · just now')).toBeNull());
    expect(appStore().categoryByKey('key')).toBeTruthy();
    await type('');

    // Swipe right on the empty home screen: your lists; swipe left: gone again
    await swipeRight('library-swipe');
    await waitFor(() => expect(screen.getByText('Your lists')).toBeTruthy());
    await swipeLeft('stage-swipe');
    await waitFor(() => expect(screen.queryByText('Your lists')).toBeNull());

    // A single fact: category on top, the name on its own line, then the value
    await type('+ birthdays dad: 12.03.1960');
    await enter();
    await type("when is my dad's birthday?");
    await waitFor(() => expect(screen.getByText('12.03.1960')).toBeTruthy());
    expect(screen.getByText('dad')).toBeTruthy();
    expect(screen.getByText('birthdays')).toBeTruthy();
    await enter(); // Enter keeps showing that one result
    await waitFor(() => expect(screen.getByText('12.03.1960')).toBeTruthy());

    // Sub-lists
    await type('+ recipes/pancakes eggs:2, flour:500g');
    expect(screen.getByText('↵ New list “pancakes” inside “recipes”: add 2 items “eggs” (2), “flour” (500g)')).toBeTruthy();
    await enter();
    await waitFor(() => expect(screen.getByText('in recipes')).toBeTruthy());
    await type('+ pancakes milk:200ml');
    await enter();
    await waitFor(() => expect(screen.getByText('200ml')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Open recipes'));
    await waitFor(() => expect(screen.getByText('3 ›')).toBeTruthy());

    // Notes
    await type('n called landlord');
    expect(screen.getByText('↵ Save note with timestamp')).toBeTruthy();
    await enter();
    await type('n today');
    await enter();
    await waitFor(() => expect(screen.getByText('called landlord')).toBeTruthy());

    // Reserved-name warning and an invalid timer explain themselves
    await type('+ t eggs');
    expect(screen.getByText(/also a command/)).toBeTruthy();
    await type('t tea');
    expect(screen.getByText(/Timer needs a duration/)).toBeTruthy();

    // Settings: theme persists; confirmation can be turned off
    await type('settings');
    await enter();
    await waitFor(() => expect(screen.getByText('Theme')).toBeTruthy());
    expect(screen.getByText('Ask before deleting')).toBeTruthy();
    await fireEvent.press(screen.getByText('Dark'));
    await waitFor(() => expect(appStore().getState().settings.theme).toBe('dark'));

    // Help
    await type('help');
    await enter();
    await waitFor(() => expect(screen.getByText('Grammar')).toBeTruthy());
  });
});
