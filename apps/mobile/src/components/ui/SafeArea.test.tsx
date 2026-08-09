// SafeAreaView tests — the prop-swap that stops a screen re-claiming the top
// inset when app chrome (the "Seeing as X" strip) already owns it. The seam is
// what edges reach the library's SafeAreaView: when TopInsetOwnedContext is
// true, 'top' is dropped (array or record form); otherwise edges pass through
// untouched. The library view itself normalizes edges into a record on its way
// to the native host, so the app's component output is captured here instead
// of read off the rendered host.
import React from 'react';
import { render } from '@testing-library/react-native';
import type { Edges } from 'react-native-safe-area-context';
import { TopInsetOwnedContext } from '../../lib/screenChrome';
import { SafeAreaView } from './SafeArea';

jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  const capturedEdges: (Edges | undefined)[] = [];
  return {
    __capturedEdges: capturedEdges,
    SafeAreaView: (props: { edges?: Edges; testID?: string }) => {
      capturedEdges.push(props.edges);
      return React.createElement(View, { testID: props.testID });
    },
  };
});

const { __capturedEdges } = jest.requireMock('react-native-safe-area-context') as {
  __capturedEdges: (Edges | undefined)[];
};

function renderSA(edges: Edges | undefined, topOwned: boolean) {
  return render(
    <TopInsetOwnedContext.Provider value={topOwned}>
      <SafeAreaView edges={edges} testID="sa" />
    </TopInsetOwnedContext.Provider>,
  );
}

const lastEdges = () => __capturedEdges[__capturedEdges.length - 1];

beforeEach(() => {
  __capturedEdges.length = 0;
});

describe('SafeAreaView', () => {
  it('drops top from an array of edges while chrome owns the inset', () => {
    renderSA(['top', 'bottom'], true);
    expect(lastEdges()).toEqual(['bottom']);
  });

  it('drops top from an edges record while chrome owns the inset', () => {
    renderSA({ top: 'off', bottom: 'additive' }, true);
    expect(lastEdges()).toEqual({ bottom: 'additive' });
  });

  it('leaves edges alone when nothing above the router owns the inset', () => {
    renderSA(['top', 'bottom'], false);
    expect(lastEdges()).toEqual(['top', 'bottom']);
  });

  it('passes an undefined edges through untouched', () => {
    renderSA(undefined, true);
    expect(lastEdges()).toBeUndefined();
  });
});
