import {
  CancellationToken,
  TestController,
  TestItem,
  TestRun,
  TestRunProfileKind,
  TestRunRequest,
  tests,
  Uri,
  window,
  workspace
} from "vscode"
import { dirname, join } from "path"
import {
  hasMessage,
  isDefined,
  removeMissing,
  runonTestTree,
  runScript,
  validate
} from "./util"
import { packageSpec, wdIOConfigRaw } from "./types"
import { runMochaConfiguration } from "./wdio_mocha"

const readpackage = async (config: Uri) => {
  const folder = dirname(config.fsPath)
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

const configs = new Map<TestItem, WdIOConfiguration>()

const runHandler = async (
  request: TestRunRequest,
  cancellation: CancellationToken
) => {
  let run: TestRun
  try {
    const ctrl = getController()
    run = ctrl.createTestRun(request)
    const rconfigs = [...ctrl.items]
      .map((i) => {
        const config = configs.get(i[1])
        if (config) return { item: i[1], config }
      })
      .filter(isDefined)
    rconfigs.forEach((c) => runonTestTree(c.item, (k) => run.enqueued(k)))
    const labels = rconfigs.map((r) => r.item.label)
    removeMissing(ctrl.items, labels)

    for (const entry of rconfigs)
      if (entry.config.framework === "cucumber") {
        window.showErrorMessage("Cucumber tests not supported yet")
        runonTestTree(entry.item, (k) => run.skipped(k))
      } else if (cancellation.isCancellationRequested)
        runonTestTree(entry.item, (k) => run.skipped(k))
      else await runMochaConfiguration(ctrl, entry.config!, entry.item, run)
  } catch (error) {
    //@ts-ignore
    window.showErrorMessage(`${error?.message}`)
  } finally {
    //@ts-ignore
    run?.end()
  }
}
const loadconfigurations = async (ctrl: TestController) => {
  try {
    const configurations = await detect()
    for (const conf of configurations) {
      const item = ctrl.createTestItem(conf.folder, conf.name)
      ctrl.items.add(item)
      configs.set(item, conf)
    }
    checkjsonReporter(configurations)
    return configurations
  } catch (error) {
    window.showErrorMessage(
      `failed to start WDIO extension:${
        hasMessage(error) ? error.message : error
      }`
    )
  }
}
const checkjsonReporter = (configurations: WdIOConfiguration[]) => {
  if (configurations.find((c) => !c.hasJsonReporter))
    window.showWarningMessage(
      "One or more folders are missing wdio-json-reporter. WDIO tests might fail running"
    )
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
