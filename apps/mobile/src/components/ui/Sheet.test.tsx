// Sheet tests — locks down the timing contract around the bottom-sheet library:
// opening mounts the sheet and calls present() one macrotask later (the retry
// that survives the remount-in-same-commit bug), and a sheet that was ever
// presented calls dismiss() when it closes. The library's modal is replaced
// with a capturing stand-in so the present/dismiss calls are observable; the
// sheet's own chrome (children, footer slot) renders through it.
import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual('react');
  const { View, ScrollView } = jest.requireActual('react-native');
  const instances: { present: jest.Mock; dismiss: jest.Mock }[] = [];
  const BottomSheetModal = React.forwardRef((props: any, ref: any) => {
    // One stable api per MOUNT — useImperativeHandle re-running its callback
    // on every render would register a fresh api (and lose the ref) each time
    // the parent re-renders the sheet. (A plain object stands in for useRef —
    // the mock's React is untyped, so a generic useRef call won't typecheck.)
    // One stable api per MOUNT — useRef survives rerenders, and
    // useImperativeHandle re-running its callback would otherwise lose the ref
    // each time the parent re-renders the sheet. (The initial value is typed
    // inline — the mock's React is untyped, so a generic useRef<T> call won't
    // typecheck.)
    const apiRef = React.useRef(null as { present: jest.Mock; dismiss: jest.Mock } | null);
    if (!apiRef.current) {
      apiRef.current = { present: jest.fn(), dismiss: jest.fn() };
      instances.push(apiRef.current);
    }
    React.useImperativeHandle(ref, () => apiRef.current!);
    return React.createElement(View, null, props.children);
  });
  const BottomSheetFooter = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  return {
    __instances: instances,
    BottomSheetModal,
    BottomSheetScrollView: ScrollView,
    BottomSheetFooter,
    useBottomSheetTimingConfigs: () => ({}),
  };
});

// The mock registers one api object per mounted BottomSheetModal.
const { __instances } = jest.requireMock('@gorhom/bottom-sheet') as {
  __instances: { present: jest.Mock; dismiss: jest.Mock }[];
};

const { Sheet } = require('./Sheet') as typeof import('./Sheet');

afterEach(() => {
  __instances.length = 0;
  jest.useRealTimers();
});

describe('Sheet', () => {
  it('renders its children inside the sheet', () => {
    const { getByText } = render(
      <ThemeProvider>
        <Sheet visible onClose={jest.fn()}>
          <Text>Sheet content</Text>
        </Sheet>
      </ThemeProvider>,
    );
    expect(getByText('Sheet content')).toBeTruthy();
  });

  it('calls present() a macrotask after opening, and dismiss() when closing', () => {
    jest.useFakeTimers();
    const onClose = jest.fn();

    const { rerender } = render(
      <ThemeProvider>
        <Sheet visible onClose={onClose}>
          <Text>Content</Text>
        </Sheet>
      </ThemeProvider>,
    );

    expect(__instances).toHaveLength(1);
    expect(__instances[0].present).not.toHaveBeenCalled();
    jest.advanceTimersByTime(0);
    expect(__instances[0].present).toHaveBeenCalledTimes(1);

    rerender(
      <ThemeProvider>
        <Sheet visible={false} onClose={onClose}>
          <Text>Content</Text>
        </Sheet>
      </ThemeProvider>,
    );
    expect(__instances[0].dismiss).toHaveBeenCalledTimes(1);
  });

  it('never presents when mounted closed, so closing stays silent', () => {
    jest.useFakeTimers();
    const { rerender } = render(
      <ThemeProvider>
        <Sheet visible={false} onClose={jest.fn()}>
          <Text>Content</Text>
        </Sheet>
      </ThemeProvider>,
    );

    jest.advanceTimersByTime(0);
    expect(__instances[0].present).not.toHaveBeenCalled();

    rerender(
      <ThemeProvider>
        <Sheet visible={false} onClose={jest.fn()}>
          <Text>Content</Text>
        </Sheet>
      </ThemeProvider>,
    );
    expect(__instances[0].dismiss).not.toHaveBeenCalled();
  });
});
