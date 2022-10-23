import {
  CancellationToken,
  Range,
  TestController,
  TestItem,
  TestItemCollection,
  TestMessage,
  TestRun,
  TestRunProfileKind,
  TestRunRequest,
  tests,
  Uri,
  workspace
} from "vscode"
import { dirname, join } from "path"
import { runCommand, runScript, validate } from "./util"
import { packageSpec, wdIOConfigRaw, wdIOTestResult } from "./types"
import {
  readdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync
} from "fs"
import { tmpdir } from "os"
import { generate } from "short-uuid"

const readpackage = async (config: Uri) => {
  const folder = dirname(config.path)
  const packageUri = config.with({ path: join(folder, "package.json") })
  const raw = await workspace.fs.readFile(packageUri)
  const packagej = JSON.parse(raw.toString())
  return validate(packageSpec, packagej)
}

export interface WdIOConfiguration {
  configFile: Uri
  name: string
  folder: string
  framework: string
  specs: string[]
  exclude: string[]
  hasJsonReporter: boolean
}

const parseConfig = async (configFile: Uri): Promise<WdIOConfiguration> => {
  const folder = dirname(configFile.fsPath)
  const script = `const {config} = require('${configFile.fsPath}')
    const {framework,specs,exclude} = config
    console.log(JSON.stringify({framework,specs,exclude},0,1))`
  const raw = runScript(script, folder)
  const { framework, specs, exclude } = validate(wdIOConfigRaw, JSON.parse(raw))
  const { name, dependencies, devDependencies } = await readpackage(configFile)
  const hasJsonReporter =
    "wdio-json-reporter" in { ...dependencies, ...devDependencies }
  return {
    configFile,
    name,
    folder,
    framework,
    specs,
    exclude,
    hasJsonReporter
  }
}

const detect = async () => {
  const configs = await workspace.findFiles("**/wdio.conf.js")
  return Promise.all(configs.map(parseConfig))
}
const getOrCreate = (
  ctrl: TestController,
  c: TestItemCollection,
  id: string,
  name: string,
  uri?: Uri
) => {
  const prev = c.get(id)
  if (prev) return prev
  const test = ctrl.createTestItem(id, name, uri)
  c.add(test)
  return test
}
const runConfiguration = async (
  ctrl: TestController,
  conf: WdIOConfiguration,
  parent: TestItem,
  run: TestRun
) => {
  const files = await runWdIOConfig(conf)
  await Promise.all(
    files.map(async (f) => {
      const fileTest = getOrCreate(
        ctrl,
        parent.children,
        `${conf.folder}_${f.name}`,
        f.name
      )
      await Promise.all(
        f.results.suites.map(async (s, i) => {
          const suiteTest = getOrCreate(
            ctrl,
            fileTest.children,
            `${conf.folder}_${f.name}_${i}`,
            s.name
          )
          await Promise.all(
            s.tests.map((t, j) => {
              const uri = Uri.parse(f.results.specs[0] || "")
              const id = `${conf.folder}_${f.name}_${s.name}_${i}_${j}`
              const test = getOrCreate(
                ctrl,
                suiteTest.children,
                id,
                t.name,
                uri
              )
              // TODO: locations in file
              test.range = new Range(j, 0, j, 1)
              run.enqueued(test)
              run.started(test)
              if (t.state === "passed") run.passed(test, t.duration)
              else {
                const message = new TestMessage(t.error || "")
                run.failed(test, message, t.duration)
              }
            })
          )
        })
      )
    })
  )
}

const configs = new Map<TestItem, WdIOConfiguration>()
const clearCollection = (c: TestItemCollection) =>
  c.forEach((i) => c.delete(i.id))

const runHandler = async (
  request: TestRunRequest,
  cancellation: CancellationToken
) => {
  let run: TestRun
  try {
    // TODO: run individual folders/suites/tests
    const ctrl = getController()
    run = ctrl.createTestRun(request)
    for (const [id, item] of ctrl.items) {
      const conf = configs.get(item)
      if (conf) await runConfiguration(ctrl, conf, item, run)
    }
    ctrl.items.forEach(async (test) => {})
  } catch (error) {
  } finally {
    //@ts-ignore
    run?.end()
  }
}
const loadconfigurations = async (ctrl: TestController) => {
  const configurations = await detect()
  for (const conf of configurations) {
    const item = ctrl.createTestItem(conf.folder, conf.name)
    ctrl.items.add(item)
    configs.set(item, conf)
  }
}
class TestRunner {
  private static instance: TestRunner
  readonly ctrl = tests.createTestController("WDIO", "Webdriver.IO")
  constructor() {
    this.ctrl.createRunProfile(
      "Run WdIO tests",
      TestRunProfileKind.Run,
      runHandler,
      true
    )
    loadconfigurations(this.ctrl)
  }

  public static get() {
    if (!TestRunner.instance) TestRunner.instance = new TestRunner()
    return TestRunner.instance
  }
}

export const getController = () => TestRunner.get().ctrl

const runWdIOConfig = async (conf: WdIOConfiguration) => {
  const folder = `wdiotests_${generate()}`
  const tmpDir = mkdtempSync(join(tmpdir(), folder))
  const modname = conf.configFile.fsPath.replace(/\.js$/, "")
  const script = `const {config} = require( "${modname}")
    // config.mochaOpts = {...config.mochaOpts,dryRun:true}
    config.reporters = [['json',{ outputDir: '${tmpDir}' ,outputFileFormat: opts => \`results-\${opts.cid}.json\`}]],
    exports.config = config`
  try {
    const dummyfile = join(tmpDir, "wdio-wrapper.js")
    writeFileSync(dummyfile, script)
    try {
      await runCommand(`npx wdio run ${dummyfile} --headless`, conf.folder)
    } catch (error) {
      console.log(error)
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
