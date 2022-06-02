import * as React from "react";
import {
  UseAsyncStateConfig,
  UseAsyncState,
} from "../../../types.internal";
import {useAsyncState} from "../../../hooks/useAsyncState";

const defaultDeps = [];

export default function AsyncStateComponent<T, E>({
  config,
  children,
  dependencies = defaultDeps
}: {
  config: UseAsyncStateConfig<T, E>,
  children: (props: UseAsyncState<T, E>) => React.ReactNode,
  dependencies?: any[],
}): any {
  if (typeof children !== "function") {
    throw new Error("AsyncStateComponent supports only render props.");
  }
  return children(useAsyncState(config, dependencies));
}
