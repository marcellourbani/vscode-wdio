import { TestController, tests, Uri, window, workspace } from "vscode"
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

class TestRunner {
  private static instance: TestRunner
  readonly ctrl = tests.createTestController("WDIO", "Webdriver.IO")

  public static get() {
    if (!TestRunner.instance) TestRunner.instance = new TestRunner()
    return TestRunner.instance
  }
}

export const getController = () => TestRunner.get().ctrl

const loadTests = (ctrl: TestController, uri: Uri) => {
  const existing = ctrl.items.get(uri.toString())
  if (existing) return
  const file = ctrl.createTestItem(
    uri.toString(),
    uri.path.split("/").pop()!,
    uri
  )
  file.canResolveChildren = true
  ctrl.items.add(file)
}

const runConfiguration2 = async (conf: WdIOConfiguration) => {
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
  } catch (error) {
    console.log(error)
  } finally {
    rmSync(tmpDir, { recursive: true })
  }
}

const runConfiguration = async (
  ctrl: TestController,
  conf: WdIOConfiguration
) => {
  const files = await runConfiguration2(conf)
}

export const runTests = async () => {
  try {
    const ctrl = getController()
    const configurations = await detect()
    for (const conf of configurations) {
      await runConfiguration(ctrl, conf)
    }
    window.showInformationMessage(
      `Test run completed, results available in the testing pane`
    )
  } catch (error) {
    window.showErrorMessage(`Error: ${error}`)
  }
}
