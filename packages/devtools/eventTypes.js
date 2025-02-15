export const newDevtoolsRequests = {
  init: "init",
  getKeys: "get-keys",
  getAsyncState: "get-async-state",
  changeAsyncState: "change-async-state",
}

export const newDevtoolsEvents = {
  setKeys: "set-keys",
  setAsyncState: "set-async-state",

  partialSync: "async-state-partial-sync",
}

export const devtoolsJournalEvents = {
  run: "run",
  update: "update",
  dispose: "dispose",
  creation: "creation",
  subscription: "subscription",
  unsubscription: "unsubscription",
  insideProvider: "inside-provider",
}
