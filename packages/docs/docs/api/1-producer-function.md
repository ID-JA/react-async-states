---
sidebar_position: 1
sidebar_label: The producer function
---
# The producer function

## What is a producer function?
The producer function is the function that returns the state's value,
here is its declaration:

```typescript
export type Producer<T> = ((props: ProducerProps<T>) => (T | Promise<T> | Generator<any, T, any>));
```

So it can be:

- A regular function returning a value.
- A pure function returning a value based on the previous value (aka reducer).
- A generator (must return the state value).
- An asynchronous function using `async/await`.
- A regular function returning a `Promise` object.
- `undefined`.

The main goal and purpose is to `run` your function,
so it will receive a single argument like this:
```javascript
// somewhere in the code, simplified:
producer({
  lastSuccess,

  args,
  payload,

  isAborted,
  onAbort,
  abort,


  run,
  runp,
  emit,
  
  select
});
```

where:

| Property      | Description                                                                                                                                |
|---------------|--------------------------------------------------------------------------------------------------------------------------------------------|
| `payload`     | The merged payload from provider and all subscribers. This allows the producer to gather data from multiple places.                        |
| `lastSuccess` | The last success state                                                                                                                     |
| `args`        | The arguments that the `run` function was given when ran                                                                                   |
| `isAborted`   | A function returns a boolean indicating whether the current run has been cancelled (by dependency change, unmount or user action)          |
| `abort`       | Imperatively abort the producer while processing it, this may be helpful only if you are working with generators                           |
| `onAbort`     | Registers a callback that will be fired when the abort is invoked (like aborting a fetch request if the user aborts or component unmounts) |
| `run`         | runs an async state or a producer and returns the abort function of that run                                                               |
| `runp`        | runs an async state or a producer and returns a promise of its state                                                                       |
| `emit`        | set the state from the producer after its resolve, this to support intervals and incoming events from an external system (like ws, sse...) |
| `select`      | returns the state of the desired async state, by key or source                                                                             |

We believe that these properties will solve all sort of possible use cases.
In fact, your function will run while having access to payload from the render,
from either the provider and subscriptions, and can be merged imperatively anytime
using `mergePayload` obtained from `useAsyncstate` and also execution args if
you run it manually (not automatic).

So basically you have three entry-points to your function (provider + subscription + exec args).

Your function will be notified with the cancellation by registering an `onAbort`
callback, you can exploit this to abort an `AbortController` which will lead
your fetches to be cancelled, or to clear a timeout, for example.

The `isAborted` function that returns a boolean that's truthy if this current run is aborted,
you may want to use it before calling a callback received from payload or
execution arguments. If using a generator, only yielding is sufficient, since the
library internally checks on cancellation before stepping any further in the generator.

The following functions are all supported by the library:

```javascript
// retrives current user, his permissions and allowed stores before resolving
function* getCurrentUser(props) {
  const controller = new AbortController();
  const {signal} = controller;
  props.onAbort(function abortFetch() {
    controller.abort();
  });

  const userData = yield fetchCurrentUser({signal});
  const [permissions, stores] = yield Promise.all([
    fetchUserPermissions(userData.id, {signal}),
    fetchUserStores(userData.id, {signal}),
  ]);

  return {
    stores,
    permissions,
    user: userData,
  };
}

async function getCurrentUserPosts(props) {
  // [...] abort logic
  return await fetchUserPosts(props.payload.principal.id, {signal});
}

async function getTransactionsList(props) {
  // abort logic
  return await fetchUserTransactions(props.payload.principal.id, {query: props.payload.queryString, signal});
}

function timeout(props) {
  let timeoutId;
  props.onAbort(function clear() {
    clearTimeout(timeoutId);
  });

  return new Promise(function resolver(resolve) {
    const callback = () => resolve(invokeIfPresent(props.payload.callback));
    timeoutId = setTimeout(callback, props.payload.delay);
  });
}

function reducer(props) {
  const action = props.args[0];
  switch(action.type) {
    case type1: return {...props.lastSuccess.data, ...action.newData};
    case type2: return {...action.data};
    
    // mixed sync and async reducers is possible
    // case type3: return fetchSomething()
  }
}
```
You can even omit the producer function, it was supported along the with the `replaceState` API that we will see later.
If you attempt to run it, it will delegate to replaceState while passing the arguments.


### What do you need with the producer ?

An AsyncState is an instance holding the state and wraps your producer function. 

The following properties are needed when using a production function,
either at module scope or via `useAsyncState`:

| Property        | Type                | Description                                        |
|-----------------|---------------------|----------------------------------------------------|
| `key`           | `string`            | The unique identifier of the async state           |
| `producer`      | `producer function` | Returns the state value of type `T`                |
| `configuration` | `ProducerConfig`    | The argument object that the producer was ran with |

The supported configuration is:

| Property              | Type                                       | Description                                                                                                                                                                                           |
|-----------------------|--------------------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `initialValue`        | `T`                                        | The initial value or the initializer of the state (status = `initial`), the initializer receives the cache as unique parameter                                                                        |
| `runEffect`           | `oneOf('debounce', 'throttle', undefined)` | An effect to apply when running the producer, can be used to debounce or throttle                                                                                                                     |
| `runEffectDurationMs` | `number > 0`, `undefined`                  | The debounce/throttle duration                                                                                                                                                                        |
| `resetStateOnDispose` | `boolean`                                  | Whether to reset the state to its initial state when all subscribers unsubscribe or to keep it. Default to `false`.                                                                                   |
| `skipPendingDelayMs`  | `number > 0` or `undefined`                | The duration under which a state update with a pending status may be skipped. The component in this case won't render with a pending status if it gets updated to something else under that duration. |
| `cacheConfig`         | `CacheConfig`                              | The cache config                                                                                                                                                                                      |


```tsx

export type ProducerConfig<T> = {
  initialValue?: T | ((cache: Record<string, CachedState<T>>) => T),
  cacheConfig?: CacheConfig<T>,
  runEffectDurationMs?: number,
  runEffect?: ProducerRunEffects,
  skipPendingDelayMs?: number,
  resetStateOnDispose?: boolean,
}

```

Where the supported cache config is:

| Property      | Type                                                              | Description                                                                      |
|---------------|-------------------------------------------------------------------|----------------------------------------------------------------------------------|
| `enabled`     | `boolean`                                                         | Whether to enable cache or not                                                   |
| `hash`        | `(args?: any[], payload?: {[id: string]: any} or null) => string` | a function to calculate a hash for a producer run (from args and payload)        |
| `getDeadline` | `(currentState: State<T>) => number`                              | returns the deadline after which the cache is invalid                            |
| `load`        | `() => {[id: AsyncStateKey]: CachedState<T>}`                     | loads the cached data when the async state instance is created                   |
| `persist`     | `(cache: {[id: AsyncStateKey]: CachedState<T>}) => void`          | a function to persist the whole cache, called when state is updated to success   |
| `onCacheLoad` | `onCacheLoad?({cache, setState}): void`                           | a callback called when the cache loads, useful when asynchronously loading cache |

Here is a small example of the usage of cache config:

```javascript
  // Creates a producer that will fetch cities by country
  // and caches them
  createSource("cities", citiesProducer, {
    cacheConfig: {
      enabled: true,
      hash: (args, payload) =>  `cities-${args[0]}`, // args[0] = countryId
      getDeadline: (state) => state.data.headers.expiresAt || 5000,
      load: () => JSON.parse(localStorage.getItem("cities-cache")),
      persist : cache => localStorage.setItem("cities-cache", JSON.stringify(cache)),
    }
  });

  const posts = {
    key: "posts",
    producer: postsProducer,
    config: {
      cacheConfig: {
        enabled: true, getDeadline: () => 50000,
        hash: (args, payload) => "posts",
        load: () => JSON.parse(localStorage.getItem("posts-cache")),
        persist: cache => localStorage.setItem("posts-cache", JSON.stringify(cache)),
      }
    }
  };
```

## Producer `props`:
The producer receives a single argument (called either `props` or `argv`).

### `payload`
The payload is gathered from the following:
- from `AsyncStateProvider` if inside it
- from all subscribers
  - Either from `useAsyncState` configuration object
  - Or from `useAsyncState().mergePayload({...})`

So it gives the producer the power of grabbing something from the provider,
or from a static context or even from the render phase or event handlers.

### `lastSuccess`
This represents the last success `State` registered by the library.

This is useful to use `reducers` by the library or if you want to append
the last data with the new one (like infinite list etc)

### `args`
The `args` property is array of `arguments` that the `run` function received
when invoked.

### `isAborted`
A function returning a boolean indicating whether this run was aborted and not
relevant anymore (dependencies change/unmount).

### `abort`
The same as `useAsyncState().abort` function. Its goal is to mark the current
run as aborted (also invokes registered abort callbacks).

### `onAbort`
This allows the producer to be notified when the run is being aborted.

This can be used for all types of asynchronous cancellations:
- Cancel fetch requests
- Cancel timeouts and intervals
- Cancel workers ..

## Run from producer: `Producer effects`
The producer function may select a state or run another, and either
care about its resolve value or not (same applies for the abort fn).

This open us new horizons for the library as you can combine these features
for a more control in your app. 

### `props.run`
This function runs the given producer/async state. It can run:
- A `Source` object
- A plain `Producer`
- If inside provider, any state by `string` key.

This function returns the `AbortFn` of the execution, so it can be chained and
registered via `props.onAbort(props.run(...))` for cascading cancellations.

Signature:

```typescript
run: <T>(input: ProducerPropsRunInput<T>, config: ProducerPropsRunConfig | null, ...args: any[] ) => AbortFn
```

Where:
- `ProducerPropsRunInput` may be a string (if inside provider), a source object,
 or a producer.
- `ProducerPropsRunConfig` a configuration object:

| Prop      | Type                    | Default value | Usage                                                                 |
|-----------|-------------------------|---------------|-----------------------------------------------------------------------|
| `lane`    | `string`                | `undefined`   | Describes the [lane](/docs/api/use-async-state#lane) that will be ran |
| `fork`    | `boolean`               | `undefined`   | `fork` is only relevant working with source or by a string key        |
| `payload` | `{ [id: string]: any }` | `null`        | `payload` is only relevant (for now) when passing a producer function |
- `...args`, the `props.args` of the resulting running producer.

The `props.run` function returns its `AbortFn`, so you can register it (if you care)
in `props.onAbort(props.run(...))`.

:::note
Running an async state by key or source or key will result in an update to 
all its subscribers.
:::


### `props.runp`
`props.runp` is similar to `props.run`, but rather than returning the abort
function, it will return a `Promise` of the resulting state so you can wait it
in the caller producer.

Signature:

```typescript
runp: <T>(input: ProducerPropsRunInput<T>, config: ProducerPropsRunConfig | null, ...args: any[] ) => Promise<State<T>> | undefined
```

```javascript
async function weatherProducer(props) {
  const location = await props.runp(fetchCurrentLocationProducer);
  const weather = await props.runp(fetchWeather, null, location.data);
  props.run(sendUsageDataProducer, null, {weather, location}); // <- props.run
  return {weather, location};
}

```

### `props.emit`

The emit function changes the state from the producer, but only works after the
producer resolves (or else you get a warning, without effect).

It was built to support subscriptions from the producer, to websocket and/or workers

Its signature is the same as useAsyncState's `replaceState`. It changes the state
instantly and imperatively to the desired value.

Signature:

```typescript
emit: (updater: T | StateFunctionUpdater<T>, status: AsyncStateStatus) => void
```

This feature allows the following easily:

```javascript
// this is a producer that updates each second
// Why adding an onAbort even if the producer itself is synchronous ?
// The abort functions are garanteed to be run, if it is aborted, or the next time you run
// or when you call abort directly
function intervalProducer(props) {
  let intervalId = setInterval(() => props.emit(old => old.data + 1), 1000);
  props.onAbort(() => clearInterval(intervalId));
  return props.args[0] ?? 0;
}
```

And this is what it takes to implement a websocket gateway in your client application

```javascript
function brokerProducer(props) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("ws://localhost:9091");
    ws.addEventListener("error", (message) => {
      reject({connected: false, error: message}); // <- first fulfillement with a rejection
    });
    ws.addEventListener("open", () => {
      resolve({ws, connected: true}); // <- first resolve, props.emit doesn't work until this is called
    });
    ws.addEventListener("close", message => {
      props.emit(message, "error"); // <- transition to error state 
    });
    ws.addEventListener("message", (message) => {
      const jsonData = JSON.parse(message.data);
      const {to} = jsonData;
      if (to) {
        props.run(to, null, jsonData); // run another producer with the received message
      }
    });
    props.onAbort(() => ws.close());
  });
}
```

### `props.select`
Signature:

```typescript
select: <T>(input: AsyncStateKeyOrSource<T>) => State<T> | undefined
```

Simply decodes your source object, or retrieves your async state from the provider
(if inside any) and gives you its actual state, a pure read mode, no subscription.

:::note
The props runners scope is cascaded:

- If you run a producer from inside an async state provider,
`props.run|runp|select` will also be able to select from the provider,
- and all cascading calls will be granted the same power.
- If you run from outside the context provider, your producers will only be able
to run a source object or a bare producer function.
:::
