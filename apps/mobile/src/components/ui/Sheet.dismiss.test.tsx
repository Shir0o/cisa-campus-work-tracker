// Regression: a bottom sheet that the user closes by dragging down dismisses
// itself. The library fires `onDismiss` only after it has already reset its
// internal modal status, so a controlled wrapper that then calls `dismiss()`
// again from its close effect corrupts that status. The next `present()` is
// silently ignored: the sheet never opens again and the launching button looks
// dead. See gorhom/react-native-bottom-sheet#2669.
//
// The mock below keeps the modal's status state machine deliberately small but
// faithful to the upstream bug: `dismiss()` on an INITIAL modal sets
// DISMISSING, and `present()` while DISMISSING is a no-op.
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: undefined, user: null, role: null }),
}));

jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const STATUS = { initial: 0, presented: 1, dismissing: 2 };
  const instances: Array<{
    status: number;
    props: any;
    present: jest.Mock;
    dismiss: jest.Mock;
    selfDismiss: jest.Mock;
  }> = [];
  const BottomSheetModal = React.forwardRef((props: any, ref: any) => {
    const apiRef = React.useRef(null as any);
    if (apiRef.current == null) {
      const api: any = {
        status: STATUS.initial,
        props,
        present: jest.fn(() => {
          if (api.status === STATUS.dismissing) return;
          api.status = STATUS.presented;
        }),
        dismiss: jest.fn(() => {
          if (api.status === STATUS.initial) {
            // The upstream corruption: a dismiss on an INITIAL modal leaves it
            // stuck in DISMISSING, so the next present() bails out.
            api.status = STATUS.dismissing;
            return;
          }
          api.status = STATUS.initial;
        }),
        selfDismiss: jest.fn(() => {
          // What a native drag-to-close does before it calls onDismiss: the
          // modal is unmounted, reset to INITIAL, then the callback fires.
          api.status = STATUS.initial;
          api.props.onDismiss?.();
        }),
      };
      apiRef.current = api;
      instances.push(api);
    } else {
      apiRef.current.props = props;
    }
    React.useImperativeHandle(ref, () => apiRef.current);
    return React.createElement(View, null, props.children);
  });
  const BottomSheetFooter = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  return {
    __instances: instances,
    __STATUS: STATUS,
    BottomSheetModal,
    BottomSheetScrollView: View,
    BottomSheetFooter,
    useBottomSheetTimingConfigs: () => ({}),
  };
});

const { __instances, __STATUS } = jest.requireMock('@gorhom/bottom-sheet') as {
  __instances: Array<{ status: number; present: jest.Mock; dismiss: jest.Mock; selfDismiss: jest.Mock }>;
  __STATUS: { initial: number; presented: number; dismissing: number };
};
const { Sheet } = require('./Sheet') as typeof import('./Sheet');

function Harness() {
  const [visible, setVisible] = React.useState(false);
  return (
    <View>
      <Pressable accessibilityLabel="open sheet" onPress={() => setVisible(true)}>
        <Text>open</Text>
      </Pressable>
      <Sheet visible={visible} onClose={() => setVisible(false)}>
        <Text>sheet body</Text>
      </Sheet>
    </View>
  );
}

afterEach(() => {
  __instances.length = 0;
  jest.useRealTimers();
});

describe('Sheet dismissal lifecycle', () => {
  it('reopens after a native self-dismiss, instead of going dead', () => {
    jest.useFakeTimers();
    const { getByLabelText } = render(
      <ThemeProvider>
        <Harness />
      </ThemeProvider>,
    );

    fireEvent.press(getByLabelText('open sheet'));
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(__instances).toHaveLength(1);
    expect(__instances[0].present).toHaveBeenCalledTimes(1);
    expect(__instances[0].status).toBe(__STATUS.presented);

    act(() => {
      __instances[0].selfDismiss();
    });
    expect(__instances[0].dismiss).not.toHaveBeenCalled();
    expect(__instances[0].status).toBe(__STATUS.initial);
    fireEvent.press(getByLabelText('open sheet'));
    act(() => {
      jest.advanceTimersByTime(0);
    });
    expect(__instances[0].present).toHaveBeenCalledTimes(2);
    expect(__instances[0].status).toBe(__STATUS.presented);
  });
});
