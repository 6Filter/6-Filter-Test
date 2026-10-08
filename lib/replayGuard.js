import { AsyncLocalStorage } from "node:async_hooks";

const replay = new AsyncLocalStorage();

export function replayActive() {
  return process.env.PRIMUS_REPLAY === "1" || Boolean(replay.getStore()?.on);
}

export function runWithoutLlm(fn) {
  return replay.run({ on: true }, fn);
}
