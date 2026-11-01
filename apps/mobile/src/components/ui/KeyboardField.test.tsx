// The keyboard rule (#1943), through its seam: the arithmetic that decides how
// far a container must scroll, and the wiring that hands that decision to the
// fields inside a scroll view. The device behaviour itself — a caret that stays
// above the keyboard on Android — is proved by a playtest, not here; what these
// pin is that the rule is applied by the shells rather than by each screen.
import React from 'react';
import { Dimensions, Keyboard, Text } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import fs from 'fs';
import path from 'path';
import {
  FIELD_REVEAL_MARGIN,
  KeyboardScrollView,
  MULTILINE_FIELD_MAX_HEIGHT,
  revealOverflow,
  useFieldReveal,
  useFieldRevealScroll,
  type Revealable,
  type ScrollHandle,
} from './KeyboardField';

const base = {
  fieldTop: 400,
  fieldHeight: 60,
  viewportTop: 100,
  viewportHeight: 300,
  keyboardTop: 400,
};

describe('revealOverflow — how far to scroll to clear the keyboard', () => {
  it('asks for nothing when the field already sits above the keyboard', () => {
    expect(revealOverflow({ ...base, fieldTop: 300 })).toBe(0);
  });

  it('scrolls just far enough to leave the field and its margin visible', () => {
    // Field bottom 460, visible bottom 400.
    expect(revealOverflow(base)).toBe(60 + FIELD_REVEAL_MARGIN);
  });

  it('stops at the keyboard when the container still runs under it', () => {
    // The wrapper has not been padded yet: the keyboard is the nearer edge.
    expect(revealOverflow({ ...base, viewportHeight: 600, keyboardTop: 400 })).toBe(60 + FIELD_REVEAL_MARGIN);
  });

  it('stops at the container when the wrapper already shortened it', () => {
    // Padding applied: the container bottom (400) is above the keyboard (900).
    expect(revealOverflow({ ...base, keyboardTop: 900 })).toBe(60 + FIELD_REVEAL_MARGIN);
  });
});

function Harness({
  scroll,
  field,
  offset = 0,
}: {
  scroll: ScrollHandle;
  field: Revealable | null;
  offset?: number;
}) {
  const { reveal, onScroll } = useFieldRevealScroll({ current: scroll });
  return (
    <>
      <Text testID="scroll" onPress={() => onScroll({ nativeEvent: { contentOffset: { y: offset } } } as never)}>
        scroll
      </Text>
      <Text testID="reveal" onPress={() => reveal(field)}>
        reveal
      </Text>
    </>
  );
}

const scrollView = (): ScrollHandle & { scrollTo: jest.Mock } => ({
  scrollTo: jest.fn(),
  measureInWindow: (callback) => callback(0, 300, 400, 300),
});

const measuredField = (top: number, height: number): Revealable => ({
  measureInWindow: (callback) => callback(0, top, 300, height),
});

describe('useFieldRevealScroll — the reveal a shell hands down', () => {
  beforeEach(() => {
    // The keyboard's top edge at 600, in window coordinates, whatever the test
    // window height is.
    jest.spyOn(Keyboard, 'metrics').mockReturnValue({
      screenX: 0,
      screenY: 600,
      width: 400,
      height: Dimensions.get('window').height - 600,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('scrolls a field that runs under the keyboard', async () => {
    const scroll = scrollView();
    const utils = await render(<Harness scroll={scroll} field={measuredField(560, 60)} />);

    await fireEvent.press(utils.getByTestId('reveal'));

    // Field bottom 620, visible bottom 600 → 20 + the margin.
    expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 20 + FIELD_REVEAL_MARGIN, animated: true });
  });

  it('leaves a field that is already visible where it is', async () => {
    const scroll = scrollView();
    const utils = await render(<Harness scroll={scroll} field={measuredField(400, 60)} />);

    await fireEvent.press(utils.getByTestId('reveal'));

    expect(scroll.scrollTo).not.toHaveBeenCalled();
  });

  it('counts from where the scroll view already is', async () => {
    const scroll = scrollView();
    const utils = await render(<Harness scroll={scroll} field={measuredField(560, 60)} offset={100} />);

    await fireEvent.press(utils.getByTestId('scroll'));
    await fireEvent.press(utils.getByTestId('reveal'));

    expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 120 + FIELD_REVEAL_MARGIN, animated: true });
  });

  it('falls back to the keyboard alone when the container cannot be measured', async () => {
    // A sheet's scroll view is a library ref: it may expose scrollTo and not
    // measureInWindow. The keyboard edge is still enough to reveal the field.
    const scroll = { scrollTo: jest.fn() };
    const utils = await render(<Harness scroll={scroll} field={measuredField(560, 60)} />);

    await fireEvent.press(utils.getByTestId('reveal'));

    expect(scroll.scrollTo).toHaveBeenCalledWith({ y: 20 + FIELD_REVEAL_MARGIN, animated: true });
  });
});

function RevealProbe() {
  return <Text>{useFieldReveal() ? 'has reveal' : 'no reveal'}</Text>;
}

describe('KeyboardScrollView — the shell a screen scrolls in', () => {
  it('hands its fields a reveal', async () => {
    const utils = await render(
      <KeyboardScrollView>
        <RevealProbe />
      </KeyboardScrollView>,
    );

    expect(utils.getByText('has reveal')).toBeTruthy();
  });
});

describe('the rule is one rule', () => {
  it('caps growing fields at the shared ceiling', () => {
    expect(MULTILINE_FIELD_MAX_HEIGHT).toBeGreaterThan(0);
    expect(MULTILINE_FIELD_MAX_HEIGHT).toBeLessThanOrEqual(200);
  });

  it('leaves no growing field in the app without that ceiling', () => {
    const roots = [path.join(__dirname, '../../..'), path.join(__dirname, '../../../app')];
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules') continue;
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) continue;
        const source = fs.readFileSync(full, 'utf8');
        if (!/multiline/i.test(source)) continue;
        if (!source.includes('MULTILINE_FIELD_MAX_HEIGHT')) offenders.push(full);
      }
    };
    roots.forEach(walk);

    expect(offenders).toEqual([]);
  });
});
