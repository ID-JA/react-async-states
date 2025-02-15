import AsyncState, {
  AsyncStateKey,
  AsyncStateSource,
  Producer,
  ProducerConfig
} from "./index";

export const createSource = function createSource<T>(
  key: AsyncStateKey,
  producer?: Producer<T> | undefined | null,
  config?: ProducerConfig<T>
): AsyncStateSource<T> {
  return new AsyncState(
    key,
    producer,
    config
  )._source;
}
