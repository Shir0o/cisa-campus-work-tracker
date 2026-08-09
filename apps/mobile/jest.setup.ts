// Global jest setup for the mobile app's component tests. Everything here is a
// boundary the real device provides that the test runner doesn't — mocks, not
// behavior, so the tests still exercise the app's own components and logic.

// Gesture handler's native module needs its jest mocks; the library's setup
// registers them as a side effect. It ships without types, so load it through
// requireActual (typed) rather than a side-effect import.
jest.requireActual('react-native-gesture-handler/jestSetup');

// Reanimated v4 runs on react-native-worklets; both reach for native modules at
// import time, so both get their official jest mocks (which also initialize the
// animation frame environment — no extra setUpTests call needed). Worklets'
// mock is only shipped compiled, at lib/module/mock.
jest.mock('react-native-worklets', () => jest.requireActual('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => jest.requireActual('react-native-reanimated/mock'));

// Safe-area insets are a native measurement; the library ships a jest mock.
jest.mock('react-native-safe-area-context', () =>
  jest.requireActual('react-native-safe-area-context/jest/mock').default,
);

// AsyncStorage is native; the library ships a jest mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// @gorhom/bottom-sheet drives a native modal. Even a closed sheet imports the
// library, so the pieces Sheet.tsx uses get inert stand-ins here; tests that
// need a real sheet's contents mock the sheet components themselves.
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual('react');
  const { ScrollView, View } = jest.requireActual('react-native');
  const BottomSheetModal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return React.createElement(View, null, props.children);
  });
  const BottomSheetFooter = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  return {
    BottomSheetModal,
    BottomSheetScrollView: ScrollView,
    BottomSheetFooter,
    useBottomSheetTimingConfigs: () => ({}),
  };
});

// @expo/vector-icons resolves font assets at render; tests only care which icon
// is where, so render its name as plain text.
jest.mock('@expo/vector-icons', () => {
  const React = jest.requireActual('react');
  const { Text } = jest.requireActual('react-native');
  const Icon = ({ name }: { name?: string }) => React.createElement(Text, null, name);
  return { Ionicons: Icon };
});

// expo-router needs the navigation tree; tests render one screen at a time.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useSegments: () => [],
}));
