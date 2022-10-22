import * as t from "io-ts"

const dryRunTest = t.type({
  title: t.string,
  fullTitle: t.string,
  file: t.string,
  currentRetry: t.number,
  speed: t.string
})

export const dryRunResult = t.type({
  tests: t.array(dryRunTest),
  pending: t.array(dryRunTest),
  failures: t.array(dryRunTest),
  passes: t.array(dryRunTest)
})

export type MochaDryRunResult = t.TypeOf<typeof dryRunResult>
