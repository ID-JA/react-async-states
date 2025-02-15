import {createSource} from "../../async-state/create-async-state";
import {readAsyncStateFromSource} from "../../async-state/AsyncState";

describe('readSource', () => {
  it('should correctly read the source', () => {
    // given
    const source = createSource("test", null, {initialValue: 0});

    // when
    const asyncState = readAsyncStateFromSource(source);

    // then
    expect(asyncState.currentState.data).toEqual(0);
  });
  it('should throw on invalid source', () => {
    // given
    const source = {key: "test", uniqueId: 0};

    // then
    // @ts-ignore
    expect(() => readAsyncStateFromSource(source))
      .toThrow("You ve passed an incompatible source object. Please make sure to pass the received source object.");
  });
});
