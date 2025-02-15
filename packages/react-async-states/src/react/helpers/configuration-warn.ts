import {warning} from "shared";
import {
  AsyncStateSubscriptionMode,
  UseAsyncStateConfiguration
} from "../../types.internal";


const creationProperties = [
  "producer",
  "runEffect",
  "cacheConfig",
  "initialValue",
  "skipPendingDelayMs",
  "runEffectDurationMs",
  "resetStateOnDispose",
];

const hoistProperties = [
  "hoistToProvider",
  "hoistToProviderConfig",
];

const forkProperties = [
  "fork",
  "forkConfig",
];


const irrelevantPropertiesByMode: Record<AsyncStateSubscriptionMode, string[]> = {
  LISTEN: [...creationProperties, ...hoistProperties, ...forkProperties],
  HOIST: [...forkProperties],
  STANDALONE: [...hoistProperties, ...forkProperties],
  WAITING: [...creationProperties, ...hoistProperties, ...forkProperties],
  FORK: [...creationProperties, ...hoistProperties],
  NOOP: [],
  SOURCE: [...creationProperties, ...hoistProperties, ...forkProperties],
  SOURCE_FORK: [...creationProperties, ...hoistProperties],
  OUTSIDE_PROVIDER: [...hoistProperties, ...forkProperties],
};

export function warnInDevAboutIrrelevantUseAsyncStateConfiguration(
  mode: AsyncStateSubscriptionMode,
  userConfig: UseAsyncStateConfiguration<any, any>
) {
  const irrelevantProperties = irrelevantPropertiesByMode[mode];
  if (!irrelevantProperties.length) {
    return;
  }

  const usedIrrelevantProperties = irrelevantProperties.filter(
    prop => userConfig[prop] !== undefined
  )

  if (usedIrrelevantProperties.length) {
    warning(`[Irrelevant configuration] - A subscription to '${userConfig.key}' ` +
      `${userConfig.subscriptionKey ? '(with subscriptionKey=' +
        userConfig.subscriptionKey + ') ' : ''}is using some ` +
      `properties that have no effect with its ${mode} mode: '${usedIrrelevantProperties.join(", ")}'`);
  }
}
