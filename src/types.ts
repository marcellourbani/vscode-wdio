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
export interface WdIOTestFile {
  name: string
  results: WdIOTestResult
}

const cucumberResult = t.intersection([
  t.type({
    status: t.string,
    duration: t.number
  }),
  t.partial({
    error_message: t.string
  })
])

const cucumberStep = t.type({
  keyword: t.string,
  name: t.string,
  result: cucumberResult,
  line: t.number
})

const cucumberElement = t.type({
  keyword: t.string,
  type: t.string,
  description: t.string,
  name: t.string,
  id: t.string,
  line: t.number,
  steps: t.array(cucumberStep)
})

export const cucumberFeature = t.type({
  keyword: t.string,
  type: t.string,
  description: t.string,
  line: t.number,
  name: t.string,
  uri: t.string,
  id: t.string,
  elements: t.array(cucumberElement)
})

export const cucumberFile = t.array(cucumberFeature)
export type CucumberResult = t.TypeOf<typeof cucumberResult>
export type CucumberStep = t.TypeOf<typeof cucumberStep>
export type CucumberElement = t.TypeOf<typeof cucumberElement>
export type CucumberFeature = t.TypeOf<typeof cucumberFeature>
export type CucumberFile = CucumberFeature[]
