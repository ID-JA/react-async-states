import {__DEV__, cloneProducerProps, isGenerator, isPromise} from "shared";
import devtools from "devtools";
import {StateBuilder} from "./utils";
import {
  ProducerFunction,
  ProducerProps,
  ProducerType,
  RunIndicators,
  State
} from "./types";
import AsyncState from "./AsyncState";

export function wrapProducerFunction<T>(asyncState: AsyncState<T>): ProducerFunction<T> {
  // this is the real deal
  return function producerFuncImpl(props: ProducerProps<T>, indicators: RunIndicators): undefined {
    // this allows the developer to omit the producer attribute.
    // and replaces state when there is no producer
    if (typeof asyncState.originalProducer !== "function") {
      indicators.fulfilled = true;
      asyncState.replaceState(props.args[0], props.args[1]);
      return;
    }
    // the running promise is used to pass the status to pending and as suspender in react18+
    let runningPromise;
    // the execution value is the return of the initial producer function
    let executionValue;
    // it is important to clone to capture properties and save only serializable stuff
    const savedProps = cloneProducerProps(props);

    try {
      executionValue = asyncState.originalProducer(props);

    } catch (e) {
      if (__DEV__) devtools.emitRunSync(asyncState, savedProps);
      indicators.fulfilled = true;
      asyncState.setState(StateBuilder.error(e, savedProps));
      return;
    }

    if (isGenerator(executionValue)) {
      asyncState.producerType = ProducerType.generator;
      if (__DEV__) devtools.emitRunGenerator(asyncState, savedProps);
      // generatorResult is either {done, value} or a promise
      let generatorResult;
      try {
        generatorResult = wrapStartedGenerator(executionValue, props, indicators);
      } catch (e) {
        indicators.fulfilled = true;
        asyncState.setState(StateBuilder.error(e, savedProps));
        return;
      }
      if (generatorResult.done) {
        indicators.fulfilled = true;
        asyncState.setState(StateBuilder.success(generatorResult.value, savedProps));
        return;
      } else {
        runningPromise = generatorResult;
        asyncState.suspender = runningPromise;
        asyncState.setState(StateBuilder.pending(savedProps) as State<any>);
      }
    } else if (isPromise(executionValue)) {
      asyncState.producerType = ProducerType.promise;
      if (__DEV__) devtools.emitRunPromise(asyncState, savedProps);
      runningPromise = executionValue;
      asyncState.suspender = runningPromise;
      asyncState.setState(StateBuilder.pending(savedProps) as State<any>);
    } else { // final value
      if (__DEV__) devtools.emitRunSync(asyncState, savedProps);
      indicators.fulfilled = true;
      asyncState.producerType = ProducerType.sync;
      asyncState.setState(StateBuilder.success(executionValue, savedProps));
      return;
    }

    runningPromise
      .then(stateData => {
        let aborted = indicators.aborted;
        if (!aborted) {
          indicators.fulfilled = true;
          asyncState.setState(StateBuilder.success(stateData, savedProps));
        }
      })
      .catch(stateError => {
        let aborted = indicators.aborted;
        if (!aborted) {
          indicators.fulfilled = true;
          asyncState.setState(StateBuilder.error(stateError, savedProps));
        }
      });
  };
}

function wrapStartedGenerator(
  generatorInstance,
  props,
  indicators
) {
  let lastGeneratorValue = generatorInstance.next();

  while (!lastGeneratorValue.done && !isPromise(lastGeneratorValue.value)) {
    lastGeneratorValue = generatorInstance.next(lastGeneratorValue.value);
  }

  if (lastGeneratorValue.done) {
    return {done: true, value: lastGeneratorValue.value};
  } else {
    // encountered a promise
    return new Promise((
      resolve,
      reject
    ) => {
      const abortGenerator = stepAsyncAndContinueStartedGenerator(
        generatorInstance,
        lastGeneratorValue,
        resolve,
        reject
      );

      function abortFn() {
        if (!indicators.fulfilled && !indicators.aborted) {
          abortGenerator();
        }
      }

      props.onAbort(abortFn);
    });
  }
}

function stepAsyncAndContinueStartedGenerator(
  generatorInstance,
  lastGeneratorValue,
  onDone,
  onReject
) {
  let aborted = false;

  // we enter here only if startupValue is pending promise of the generator instance!
  lastGeneratorValue.value.then(step, onGeneratorCatch);

  function onGeneratorResolve(resolveValue) {
    if (aborted) {
      return;
    }
    if (!lastGeneratorValue.done) {
      step();
    } else {
      onDone(resolveValue);
    }
  }

  function onGeneratorCatch(e) {
    if (aborted) {
      return;
    }
    if (lastGeneratorValue.done) {
      onDone(e);
    } else {
      try {
        lastGeneratorValue = generatorInstance.throw(e);
      } catch (newException) {
        onReject(newException);
      }
      if (lastGeneratorValue.done) {
        onDone(lastGeneratorValue.value);
      } else {
        step();
      }
    }
  }

  function step() {
    if (aborted) {
      return;
    }
    try {
      lastGeneratorValue = generatorInstance.next(lastGeneratorValue.value);
    } catch (e) {
      onGeneratorCatch(e);
    }
    Promise
      .resolve(lastGeneratorValue.value)
      .then(onGeneratorResolve, onGeneratorCatch)
  }

  return function abort() {
    aborted = true;
  }
}
