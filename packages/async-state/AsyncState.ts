import {
  __DEV__,
  cloneProducerProps,
  invokeIfPresent,
  numberOrZero,
  shallowClone,
  warning
} from "shared";
import {wrapProducerFunction} from "./wrap-producer-function";
import {
  constructAsyncStateSource,
  StateBuilder,
  warnDevAboutAsyncStateKey
} from "./utils";
import devtools from "devtools";
import {areRunEffectsSupported} from "shared/features";
import {
  AbortFn,
  AsyncStateInterface,
  AsyncStateKey,
  AsyncStateSource,
  AsyncStateStatus,
  ForkConfig,
  Producer,
  ProducerConfig,
  ProducerFunction,
  ProducerProps,
  ProducerRunEffects,
  RunExtraPropsCreator,
  State,
  StateFunctionUpdater,
  StateSubscription
} from "./types";

export default class AsyncState<T> implements AsyncStateInterface<T> {
  //region properties
  key: AsyncStateKey;
  _source: AsyncStateSource<T>;
  uniqueId: number | undefined;

  currentState: State<T>;
  lastSuccess: State<T>;

  config: ProducerConfig<T>;
  private locks: number = 0;
  private forkCount: number = 0;
  payload: { [id: string]: any } | null = null;
  private pendingTimeout: { id: ReturnType<typeof setTimeout>, startDate: number } | null = null;

  private subscriptionsMeter: number = 0;
  subscriptions: { [id: number]: StateSubscription<T> } = {};

  producer: ProducerFunction<T>;
  suspender: Promise<T> | undefined = undefined;
  readonly originalProducer: Producer<T> | undefined;
  private currentAborter: AbortFn = undefined;

  //endregion

  constructor(
    key: AsyncStateKey,
    producer: Producer<T> | undefined,
    config: ProducerConfig<T>
  ) {
    warnDevAboutAsyncStateKey(key);

    this.key = key;
    this.config = shallowClone(config);
    this.originalProducer = producer;

    const initialValue = typeof this.config.initialValue === "function" ? this.config.initialValue() : this.config.initialValue;
    this.currentState = StateBuilder.initial(initialValue);
    this.lastSuccess = this.currentState;

    this.producer = wrapProducerFunction(this);

    if (__DEV__) {
      this.uniqueId = nextUniqueId();
    }

    this._source = makeSource(this);

    Object.preventExtensions(this);

    if (__DEV__) devtools.emitCreation(this);
  }

  setState(
    newState: State<T>,
    notify: boolean = true
  ): void {
    if (__DEV__) devtools.startUpdate(this);

    this.currentState = newState;

    if (this.currentState.status === AsyncStateStatus.success) {
      this.lastSuccess = this.currentState;
    }

    if (this.currentState.status !== AsyncStateStatus.pending) {
      this.suspender = undefined;
    }
    if (__DEV__) devtools.emitUpdate(this);

    if (notify) {
      notifySubscribers(this as AsyncStateInterface<any>);
    }
  }

  abort(reason: any = undefined) {
    invokeIfPresent(this.currentAborter, reason);
  }

  dispose() {
    if (this.locks > 0) {
      return false;
    }

    this.abort();
    clearSubscribers(this as AsyncStateInterface<T>);

    this.locks = 0;
    const initialValue = typeof this.config.initialValue === "function" ? this.config.initialValue() : this.config.initialValue;
    this.setState(StateBuilder.initial(initialValue));
    if (__DEV__) devtools.emitDispose(this);

    return true;
  }

  run(extraPropsCreator: RunExtraPropsCreator<T>, ...args: any[]) {
    const effectDurationMs = numberOrZero(this.config.runEffectDurationMs);

    if (!areRunEffectsSupported() || !this.config.runEffect || effectDurationMs === 0) {
      return this.runImmediately(extraPropsCreator, ...args);
    } else {
      return this.runWithEffect(extraPropsCreator, ...args);
    }
  }

  private runWithEffect(
    extraPropsCreator: RunExtraPropsCreator<T>, ...args: any[]): AbortFn {

    const effectDurationMs = numberOrZero(this.config.runEffectDurationMs);

    const that = this;
    if (areRunEffectsSupported() && this.config.runEffect) {
      const now = Date.now();

      // @ts-ignore
      function registerTimeout() {
        let runAbortCallback: AbortFn | null = null;

        const timeoutId = setTimeout(function realRun() {
          that.pendingTimeout = null;
          runAbortCallback = that.runImmediately(extraPropsCreator, ...args);
        }, effectDurationMs);

        that.pendingTimeout = {
          id: timeoutId,
          startDate: now,
        };

        return function abortCleanup(reason) {
          clearTimeout(timeoutId);
          that.pendingTimeout = null;
          invokeIfPresent(runAbortCallback, reason);
        }
      }


      switch (this.config.runEffect) {
        case ProducerRunEffects.delay:
        case ProducerRunEffects.debounce:
        case ProducerRunEffects.takeLast:
        case ProducerRunEffects.takeLatest: {
          if (this.pendingTimeout) {
            const deadline = this.pendingTimeout.startDate + effectDurationMs;
            if (now < deadline) {
              clearTimeout(this.pendingTimeout.id);
            }
          }
          return registerTimeout();
        }
        case ProducerRunEffects.throttle:
        case ProducerRunEffects.takeFirst:
        case ProducerRunEffects.takeLeading: {
          if (this.pendingTimeout) {
            const deadline = this.pendingTimeout.startDate + effectDurationMs;
            if (now <= deadline) {
              return function noop() {
                // this functions does nothing
              };
            }
            break;
          } else {
            return registerTimeout();
          }
        }
      }
    }
    return this.runImmediately(extraPropsCreator, ...args);
  }

  private runImmediately(
    extraPropsCreator: RunExtraPropsCreator<T>,
    ...execArgs: any[]
  ): AbortFn {
    if (this.currentState.status === AsyncStateStatus.pending) {
      this.abort();
      this.currentAborter = undefined;
    } else if (typeof this.currentAborter === "function") {
      this.abort();
    }

    const that = this;

    let onAbortCallbacks: AbortFn[] = [];

    // @ts-ignore
    // ts yelling to add a run, runp and select functions
    // but run and runp will require access to this props object,
    // so they are constructed later, and appended to the same object.
    const props: ProducerProps<T> = {
      emit,
      abort,
      args: execArgs,
      aborted: false,
      lastSuccess: that.lastSuccess,
      payload: shallowClone(that.payload),
      onAbort(cb: AbortFn) {
        if (typeof cb === "function") {
          onAbortCallbacks.push(cb);
        }
      },
    };
    Object.assign(props, extraPropsCreator(props));

    function emit(
      updater: T | StateFunctionUpdater<T>,
      status: AsyncStateStatus
    ): void {
      if (props.cleared && that.currentState.status === AsyncStateStatus.aborted) {
        warning("You are emitting while your producer is passing to aborted state." +
          "This has no effect and not supported by the library. The next " +
          "state value on aborted state is the reason of the abort.");
        return;
      }
      if (!props.fulfilled) {
        warning("Called props.emit before the producer resolves. This is" +
          " not supported in the library and will have no effect");
        return;
      }
      that.replaceState(updater, status);
    }

    function abort(reason: any): AbortFn | undefined {
      if (props.aborted || props.cleared) {
        return;
      }

      if (!props.fulfilled) {
        props.aborted = true;
        that.setState(StateBuilder.aborted(reason, cloneProducerProps(props)));
      }

      props.cleared = true;
      onAbortCallbacks.forEach(function clean(func) {
        invokeIfPresent(func, reason);
      });
      that.currentAborter = undefined;
    }

    this.currentAborter = abort;
    this.producer(props);
    return abort;
  }

  subscribe(
    cb,
    subKey?: string | undefined
  ): AbortFn {
    let that = this;
    this.subscriptionsMeter += 1;
    // @ts-ignore
    let subscriptionKey: string = subKey;

    if (subKey === undefined) {
      subscriptionKey = `${this.key}-sub-${this.subscriptionsMeter}`;
    }

    function cleanup() {
      that.locks -= 1;
      delete that.subscriptions[subscriptionKey];
      if (__DEV__) devtools.emitUnsubscription(that, subscriptionKey);
    }

    this.subscriptions[subscriptionKey] = {
      cleanup,
      callback: cb,
      key: subscriptionKey,
    };
    this.locks += 1;

    if (__DEV__) devtools.emitSubscription(this, subscriptionKey);
    return cleanup;
  }

  fork(forkConfig?: { keepState: boolean, key: AsyncStateKey }) {
    const mergedConfig: ForkConfig = shallowClone(defaultForkConfig, forkConfig);

    let {key} = mergedConfig;

    if (key === undefined) {
      key = `${this.key}-fork-${this.forkCount + 1}`;
    }

    const clone = new AsyncState(key, this.originalProducer, this.config);

    // if something fail, no need to increment
    this.forkCount += 1;

    if (mergedConfig.keepState) {
      clone.currentState = shallowClone(this.currentState);
      clone.lastSuccess = shallowClone(this.lastSuccess);
    }

    return clone as AsyncStateInterface<T>;
  }

  replaceState(
    newValue: T | StateFunctionUpdater<T>,
    status = AsyncStateStatus.success
  ): void {
    if (!StateBuilder[status]) {
      throw new Error(`Couldn't replace state to status ${status}, because it is unknown.`);
    }
    if (this.currentState.status === AsyncStateStatus.pending) {
      this.abort();
      this.currentAborter = undefined;
    }

    let effectiveValue = newValue;
    if (typeof newValue === "function") {
      effectiveValue = (newValue as StateFunctionUpdater<T>)(this.currentState);
    }


    if (__DEV__) devtools.emitReplaceState(this);
    // @ts-ignore
    const savedProps = cloneProducerProps({
      args: [effectiveValue],
      lastSuccess: this.lastSuccess,
      payload: shallowClone(this.payload),
    });
    this.setState(StateBuilder[status](effectiveValue, savedProps));
  }
}

function nextUniqueId() {
  return ++uniqueId;
}

let uniqueId: number = 0;
const sourceIsSourceSymbol: symbol = Symbol();

const defaultForkConfig: ForkConfig = Object.freeze({keepState: false});

function makeSource<T>(asyncState: AsyncStateInterface<T>) {
  const source: AsyncStateSource<T> = constructAsyncStateSource(asyncState);
  source.key = asyncState.key;

  Object.defineProperty(source, sourceIsSourceSymbol, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  if (__DEV__) {
    source.uniqueId = asyncState.uniqueId;
  }

  return Object.freeze(source);
}


function notifySubscribers(asyncState: AsyncStateInterface<any>) {
  Object.values(asyncState.subscriptions).forEach(subscription => {
    subscription.callback(asyncState.currentState);
  });
}

function clearSubscribers(asyncState: AsyncStateInterface<any>) {
  Object.values(asyncState.subscriptions).forEach(subscription => {
    subscription.cleanup();
  });
}


export function isAsyncStateSource(possiblySource: any) {
  return possiblySource && possiblySource[sourceIsSourceSymbol] === true;
}