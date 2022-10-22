import { TestController, tests, Uri, window, workspace } from "vscode"
import { dirname, join } from "path"
import { exec } from "child_process"
import { promisify } from "util"
import { validate } from "./util"
import { dryRunResult } from "./mochatestresults"

const detect = async () => {
  const configs = await workspace.findFiles("**/wdio.conf.js")
  return configs
}
const loadfiles = async (config: Uri) => {
  const folder = dirname(config.path)
  const files = await workspace.findFiles("webapp/test/e2e/*.test.js")
  return files
}

const runCommand = (cmd: string) => promisify(exec)(cmd)

class TestRunner {
  private static instance: TestRunner
  readonly ctrl
  constructor() {
    this.ctrl = tests.createTestController("WDIO", "Webdriver.IO")
    this.ctrl.resolveHandler = async (item) => {
      const uri = item?.uri
      if (!uri) return
      try {
        const { stdout } = await runCommand(
          `npx mocha  --dry-run -R json ${uri.fsPath}`
        )
        const results = validate(dryRunResult, JSON.parse(stdout))
        let count = 1
        results.tests.forEach((t) => {
          const child = this.ctrl.createTestItem(
            `${t.file}_${count++}`,
            t.fullTitle
          )
          item.children.add(child)
        })
      } catch (error) {
        console.log(error)
      }
    }
  }
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

export const runTests = async () => {
  try {
    const ctrl = getController()
    const configurations = await detect()
    const files = await loadfiles(configurations[0]!)
    for (const file of files) {
      loadTests(ctrl, file)
    }
    window.showInformationMessage(`vscode-wdio activated,${configurations}`)
  } catch (error) {
    window.showErrorMessage(`Error: ${error}`)
  }
}
