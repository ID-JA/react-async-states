import * as React from "react";
import {fireEvent, render, screen} from "@testing-library/react";
import {
  AsyncStateSubscriptionMode, UseAsyncState,
  UseSelectedAsyncState
} from "../../../../../types.internal";
import {useAsyncState} from "../../../../../hooks/useAsyncState";
import {AsyncStateProvider} from "../../../../../provider/AsyncStateProvider";

describe('should declare a standalone producer inside a provider', () => {
  it('should declare a standalone producer inside a provider ', async () => {
    // given
    function Test() {
      return (
        <AsyncStateProvider>
          <Component/>
        </AsyncStateProvider>
      );
    }

    function Component() {
      const {
        run,
        mode,
        state,
      }: UseSelectedAsyncState<number, number> = useAsyncState({
          selector: d => d.data,
          producer(props) {
            return props.args[0];
          },
          initialValue: 0,
        });

      function increment() {
        run(state + 1);
      }

      function decrement() {
        run(state - 1);
      }

      return (
        <div>
          <button data-testid="increment" onClick={increment}>increment</button>
          <button data-testid="decrement" onClick={decrement}>decrement</button>
          <span data-testid="mode">{mode}</span>
          <span data-testid="result">{state}</span>
        </div>);
    }

    // when

    render(<Test/>)

    const incrementBtn = screen.getByTestId("increment");
    const decrementBtn = screen.getByTestId("decrement");
    // then
    expect(screen.getByTestId("mode").innerHTML)
      .toEqual(AsyncStateSubscriptionMode.STANDALONE);

    // +1
    fireEvent.click(incrementBtn);
    expect(screen.getByTestId("result").innerHTML).toEqual("1");

    // -1
    fireEvent.click(decrementBtn);
    expect(screen.getByTestId("result").innerHTML).toEqual("0");
  });
  it('should declare a standalone producer inside a provider with key ', async () => {
    // given
    function Test() {
      return (
        <AsyncStateProvider>
          <Component/>
        </AsyncStateProvider>
      );
    }

    function Component() {
      const {
        mode,
      }: UseSelectedAsyncState<number, number> = useAsyncState({
        key: "standalone",
        producer(props) {
          return props.args[0];
        },
        initialValue: 0,
        selector: d => d.data,
      });
      return <span data-testid="mode">{mode}</span>;
    }

    // when

    render(<Test/>)

    // then
    expect(screen.getByTestId("mode").innerHTML)
      .toEqual(AsyncStateSubscriptionMode.STANDALONE);
  });
});
