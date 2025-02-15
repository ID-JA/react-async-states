import AsyncState from "../../../async-state";
import {
  standaloneProducerEffectsCreator
} from "../../../async-state/AsyncState";

describe('AsyncState.reply', () => {
  it('should reply async state latest run', () => {
    // given
    const producer = jest.fn().mockImplementation((props) => props.args?.[0]);
    const asyncState = new AsyncState("key", producer);

    asyncState.payload = {hello: true};
    // when

    asyncState.replay();
    expect(producer).not.toHaveBeenCalled();

    asyncState.run(standaloneProducerEffectsCreator, 1);
    // then

    expect(producer.mock.calls[0][0].args).toEqual([1]);
    expect(producer.mock.calls[0][0].payload).toEqual({hello: true});


    asyncState.payload = {hello: false};
    expect(asyncState.payload.hello).toBe(false);


    asyncState.replay();
    expect(producer.mock.calls[1][0].args).toEqual([1]);
    expect(producer.mock.calls[1][0].payload).toEqual({hello: true});
  });
});
