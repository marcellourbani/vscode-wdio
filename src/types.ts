import * as t from "io-ts"

const nullable = <T extends t.Mixed>(x: T) => t.union([t.undefined, x])

export const wdIOConfigRaw = t.type({
  framework: t.string,
  specs: t.array(t.string),
  exclude: t.array(t.string)
})

export const packageSpec = t.type({
  name: t.string,
  devDependencies: nullable(t.record(t.string, t.string)),
  dependencies: nullable(t.record(t.string, t.string))
})

const wdIOTest = t.type({
  name: t.string,
  start: t.string,
  end: t.string,
  duration: t.number,
  state: t.string,
  errorType: nullable(t.string),
  error: nullable(t.string),
  standardError: nullable(t.string)
})

const wdIOTestSuite = t.type({
  name: t.string,
  duration: t.number,
  start: t.string,
  end: t.string,
  sessionId: t.string,
  tests: t.array(wdIOTest)
})

export const wdIOTestResult = t.type({
  suites: t.array(wdIOTestSuite),
  specs: t.array(t.string)
})

export type WdIOTest = t.TypeOf<typeof wdIOTest>
export type WdIOTestSuite = t.TypeOf<typeof wdIOTestSuite>
export type WdIOTestResult = t.TypeOf<typeof wdIOTestResult>