import {
  CancellationToken,
  TestController,
  TestRun,
  TestRunProfileKind,
  TestRunRequest,
  tests,
  Uri,
  window,
  workspace
} from "vscode"
import { basename, dirname, join } from "path"
import {
  errString,
  getOrCreate,
  isDefined,
  removeMissing,
  runonTestTree,
  runScript,
  validate
} from "./util"
import { ConfigParser } from "@wdio/config"
import { packageSpec, wdIOConfigRaw } from "./types"
import { runMochaConfiguration } from "./wdio_mocha"
import { configFileGlob, FileWatcher } from "./config"
import { runCucumberConfiguration } from "./wdio-cucumber"
import { log } from "./logger"

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
  log(`Trying to parse config file ${configFile.fsPath}`)
  try {
    const parser = new ConfigParser(configFile.fsPath)
    parser.initialize()
    const config = parser.getConfig()
    log(config)
  } catch (error) {
    log(errString(error))
  }
  const folder = dirname(configFile.fsPath)
  const script = `const {config} = require('${configFile.fsPath}')
    const {framework,specs,exclude=[]} = config
    console.log(JSON.stringify({framework,specs,exclude},0,1))`
  const res = runScript(script, configFile, folder)
  if (res.status) {
    log(`Failed to parse config file ${configFile.fsPath}`, res.stderr)
    throw new Error(
      `Failed to parse config for ${basename(configFile.fsPath)}: ${res.stderr}`
    )
  }
  const { framework, specs, exclude } = validate(
    wdIOConfigRaw,
    JSON.parse(res.stdout)
  )
  const {
    name = basename(folder),
    dependencies,
    devDependencies
  } = await readpackage(configFile)
  const alldeps = { ...dependencies, ...devDependencies }
  const hasJsonReporter =
    "wdio-json-reporter" in alldeps ||
    "@seeplusplus/wdio-json-reporter" in alldeps
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
  const glob = configFileGlob()
  const configs = await workspace.findFiles(glob)
  return Promise.all(configs.map(parseConfig))
}

const configs = new Map<string, WdIOConfiguration>()

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
        const config = configs.get(i[0])
        if (config) return { item: i[1], config }
      })
      .filter(isDefined)
    rconfigs.forEach((c) => runonTestTree(c.item, (k) => run.enqueued(k)))
    const labels = rconfigs.map((r) => r.item.label)
    removeMissing(ctrl.items, labels)

    for (const entry of rconfigs)
      if (cancellation.isCancellationRequested) {
        runonTestTree(entry.item, (k) => run.skipped(k))
      } else if (entry.config.framework === "cucumber")
        await runCucumberConfiguration(ctrl, entry.config, entry.item, run)
      else await runMochaConfiguration(ctrl, entry.config, entry.item, run)
  } catch (error) {
    //@ts-ignore
    window.showErrorMessage(`${error?.message}`)
  } finally {
    //@ts-ignore
    run?.end()
  }
}

export const loadconfigurations = async (ctrl: TestController) => {
  try {
    FileWatcher.get().setWatchers()
    const configurations = await detect()
    for (const conf of configurations) {
      const item = getOrCreate(
        ctrl,
        ctrl.items,
        conf.folder,
        conf.name,
        conf.configFile
      )
      configs.set(item.id, conf)
    }
    checkjsonReporter(configurations)
    const obsolete = [...configs.keys()].filter(
      (id) => !configurations.find((c) => c.folder === id)
    )
    for (const o of obsolete) {
      configs.delete(o)
      ctrl.items.delete(o)
    }
    return configurations
  } catch (error) {
    const message = `failed to load WDIO configuration:${errString(error)}`
    log(message)
    window.showErrorMessage(message)
  }
}
const checkjsonReporter = (configurations: WdIOConfiguration[]) => {
  if (
    configurations.find((c) => !c.hasJsonReporter && c.framework !== "cucumber")
  )
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
