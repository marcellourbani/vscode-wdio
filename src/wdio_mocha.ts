import {
  mkdtempSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync
} from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { generate } from "short-uuid"
import {
  TestController,
  TestItem,
  TestRun,
  Uri,
  Range,
  TestMessage,
  window,
  MarkdownString
} from "vscode"
import { extractMochaTests } from "./parse_mocha"
import {
  wdIOTestResult,
  WdIOTestResult,
  WdIOTest,
  WdIOTestSuite,
  WdIOTestFile
} from "./types"
import {
  getOrCreate,
  hasStderr,
  normalizePath,
  removeMissing,
  removeMissingTests,
  runCommand,
  runonTestTree,
  validate
} from "./util"
import { WdIOConfiguration } from "./wdio"
import * as ansiRegex from "ansi-regex"

interface MochaTest extends WdIOTest {
  range?: Range
}
interface MochaTestSuite extends WdIOTestSuite {
  tests: MochaTest[]
}
interface MochaTestResults extends WdIOTestResult {
  suites: MochaTestSuite[]
}

interface MochaTestFile extends WdIOTestFile {
  results: MochaTestResults
}

const reporterMissing = (e: unknown) => {
  //   if (hasMessage(e) && e.message.match(/^Command failed/)) throw e // often fails with valid tests
  if (!hasStderr(e)) return
  if (e.stderr.match(/Error: Couldn't find plugin "json" reporter/))
    throw new Error(
      "WDIO Json reporter not installed please add wdio-json-reporter to the relevant project: npm i --save-dev wdio-json-reporter"
    )
  const badversion = e.stderr.match(
    /ERROR webdriver: R.*This version of ChromeDriver only supports Chrome version\s*([\d]+)/
  )
  if (badversion)
    throw new Error(
      `Chromedriver version only supports chrome ${badversion[1]}`
    )
}

const runWdIOConfig = async (conf: WdIOConfiguration) => {
  const folder = `wdiotests_${generate()}`
  const tmpDir = mkdtempSync(join(tmpdir(), folder))
  const modname = normalizePath(conf.configFile.fsPath.replace(/\.js$/, ""))
  const script = `const {config} = require( "${modname}")
      // config.mochaOpts = {...config.mochaOpts,dryRun:true}
      config.reporters = [['json',{ outputDir: '${normalizePath(
        tmpDir
      )}' ,outputFileFormat: opts => \`results-\${opts.cid}.json\`}]],
      exports.config = config`
  try {
    const dummyfile = join(tmpDir, "wdio-wrapper.js")
    writeFileSync(dummyfile, script)
    try {
      await runCommand(`npx wdio run ${dummyfile} --headless`, conf.folder)
    } catch (error) {
      console.log(error)
      reporterMissing(error)
    }
    const files = readdirSync(tmpDir)
      .filter((f) => f.match(/results-.*\.json/))
      .map((name) => {
        const raw = JSON.parse(readFileSync(join(tmpDir, name)).toString())
        const results = validate(wdIOTestResult, raw)
        return { name, results }
      })
    return files
  } finally {
    rmSync(tmpDir, { recursive: true })
  }
}

const checkTestLengths = <T1, T2>(a: { tests: T1[] }[], b: { tests: T2[] }[]) =>
  a.length === b.length &&
  a.every(({ tests }, i) => b[i]?.tests.length === tests.length)

const convertFile = ({ results, name }: WdIOTestFile): MochaTestFile => {
  const source = readFileSync(results.specs[0]).toString()
  const suites = extractMochaTests(source)
  if (!checkTestLengths(suites, results.suites)) return { name, results }
  const msuites = results.suites.map((suite, i) => {
    const tests = suite.tests.map((test, j) => {
      const line = suites[i]?.tests[j].start?.line
      if (line) return { ...test, range: new Range(line - 1, 0, line - 1, 1) }
      return test
    })
    return { ...suite, tests }
  })
  return { name, results: { ...results, suites: msuites } }
}

export const processTest = async (
  ctrl: TestController,
  run: TestRun,
  parent: TestItem,
  mtest: MochaTest,
  testindex: number,
  uri: Uri
) => {
  const id = `${parent.id}_${testindex}`
  const test = getOrCreate(ctrl, parent.children, id, mtest.name, uri)
  test.range = mtest.range
  run.enqueued(test)
  run.started(test)
  if (mtest.state === "passed") run.passed(test, mtest.duration)
  else {
    const message = new TestMessage(mtest.error?.replace(ansiRegex(), "") || "")
    run.failed(test, message, mtest.duration)
  }
  return test
}

export const processSuite = async (
  ctrl: TestController,
  run: TestRun,
  parent: TestItem,
  suite: MochaTestSuite,
  suiteindex: number,
  uri: Uri
) => {
  const id = `${parent.id}_${suiteindex}`
  const suiteTest = getOrCreate(ctrl, parent.children, id, suite.name)
  const labels = suite.tests.map((t) => t.name)
  removeMissing(suiteTest.children, labels)
  const tests = await Promise.all(
    suite.tests.map((t, i) => processTest(ctrl, run, suiteTest, t, i, uri))
  )
  removeMissingTests(suiteTest.children, tests)
  return suiteTest
}

export const processFile = async (
  ctrl: TestController,
  run: TestRun,
  parent: TestItem,
  file: MochaTestFile
) => {
  const id = `${parent.id}_${file.name}`
  const path = normalizePath(file.results.specs[0] || "")
  const uri = Uri.parse("file://").with({ path })
  const fileTest = getOrCreate(ctrl, parent.children, id, file.name, uri)
  const labels = file.results.suites.map((s) => s.name)
  removeMissing(fileTest.children, labels)
  const suites = await Promise.all(
    file.results.suites.map((s, i) =>
      processSuite(ctrl, run, fileTest, s, i, uri)
    )
  )
  removeMissingTests(fileTest.children, suites)
  return fileTest
}

export const runMochaConfiguration = async (
  ctrl: TestController,
  conf: WdIOConfiguration,
  parent: TestItem,
  run: TestRun
) => {
  run.started(parent)
  runonTestTree(parent, (k) => run.started(k))
  const files = await runWdIOConfig(conf)
  const labels = files.map((f) => f.name)
  removeMissing(parent.children, labels)
  const mfiles = files.map(convertFile)
  const fileTests = await Promise.all(
    mfiles.map((file) => processFile(ctrl, run, parent, file))
  )
  removeMissingTests(parent.children, fileTests)
}
