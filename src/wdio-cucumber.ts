import { generate } from "short-uuid"
import { WdIOConfiguration } from "./wdio"
import {
  mkdtempSync,
  writeFileSync,
  readdirSync,
  readFileSync,
  rmSync
} from "fs"
import {
  getOrCreate,
  hasStderr,
  normalizePath,
  removeMissingId,
  runCommand,
  runonTestTree,
  validate
} from "./util"
import { basename, join } from "path"
import { tmpdir } from "os"
import { runHeadless } from "./config"
import {
  CucumberElement,
  CucumberFeature,
  CucumberFile,
  cucumberFile,
  CucumberStep
} from "./types"
import { TestController, TestItem, TestMessage, TestRun } from "vscode"
import ansiRegex = require("ansi-regex")

interface CucumberFileEntry {
  name: string
  file: CucumberFile
}

const reporterMissing = (e: unknown) => {
  if (!hasStderr(e)) return
  if (e.stderr.match(/Error: Couldn't find plugin "json" reporter/))
    throw new Error(
      "WDIO Json reporter not installed please add wdio-json-reporter to the relevant project: npm i --save-dev @seeplusplus/wdio-json-reporter"
    )
  const badversion = e.stderr.match(
    /ERROR webdriver: R.*This version of ChromeDriver only supports Chrome version\s*([\d]+)/
  )
  if (badversion)
    throw new Error(
      `Chromedriver version only supports chrome ${badversion[1]}`
    )
}
const runWdIOConfigC = async (
  conf: WdIOConfiguration
): Promise<CucumberFileEntry[]> => {
  const folder = `wdiotests_${generate()}`
  const tmpDir = mkdtempSync(join(tmpdir(), folder))
  const modname = normalizePath(conf.configFile.fsPath.replace(/\.js$/, ""))
  const script = `const {config} = require( "${modname}")
        config.reporters = [['cucumberjs-json',{ jsonFolder: '${normalizePath(
          tmpDir
        )}'}]]
        exports.config = config`
  try {
    const dummyfile = join(tmpDir, "wdio-wrapper.js")
    writeFileSync(dummyfile, script)
    let runerr = undefined
    try {
      const headless = runHeadless() ? "--headless" : ""
      await runCommand(`npx wdio run ${dummyfile} ${headless}`, conf.folder)
    } catch (error) {
      console.log(error)
      reporterMissing(error)
      runerr = error //wdio returns an error if any test failed, doesn't usually mean the process failed
    }
    const rawRes = readdirSync(tmpDir).filter((f) => f.match(/.*\.json/))
    if (rawRes.length === 0) throw runerr // no output detected, assume things went south
    return rawRes.flatMap((name) => {
      const raw = JSON.parse(readFileSync(join(tmpDir, name)).toString())
      const file = validate(cucumberFile, raw)
      return { name, file }
    })
  } finally {
    rmSync(tmpDir, { recursive: true })
  }
}

const elementId = (parentId: string, e: CucumberElement, idx: number) =>
  `${parentId}_${e.id}_${idx}`

const processStep = (
  ctrl: TestController,
  run: TestRun,
  parent: TestItem,
  idx: number,
  step: CucumberStep
) => {
  const id = `${parent.id}_${idx}`
  const name = `${step.keyword} ${step.name}`
  const stapTest = getOrCreate(ctrl, parent.children, id, name)
  stapTest.sortText = id
  run.enqueued(stapTest)
  run.started(stapTest)
  if (step.result.status === "passed")
    run.passed(stapTest, step.result.duration)
  else {
    const message = new TestMessage(
      step.result.error_message?.replace(ansiRegex(), "") || ""
    )
    run.failed(stapTest, message, step.result.duration)
  }

  return stapTest
}

const processElement = (
  ctrl: TestController,
  run: TestRun,
  parent: TestItem,
  idx: number,
  element: CucumberElement
) => {
  const id = elementId(parent.id, element, idx)
  const elementTest = getOrCreate(ctrl, parent.children, id, element.name)
  const steps = element.steps.map((s, i) =>
    processStep(ctrl, run, elementTest, i, s)
  )
  const labels = steps.map((s) => s.id)
  removeMissingId(elementTest.children, labels)
  return elementTest
}

const processFeature = (
  ctrl: TestController,
  run: TestRun,
  parent: TestItem,
  idx: number,
  feature: CucumberFeature
) => {
  const id = `${parent.id}_${idx}`
  const fileTest = getOrCreate(
    ctrl,
    parent.children,
    id,
    basename(feature.name)
  )
  const elements = feature.elements.map((e, i) =>
    processElement(ctrl, run, fileTest, i, e)
  )

  const labels = elements.map((e) => e.id)
  removeMissingId(fileTest.children, labels)
  return fileTest
}

const processFile = (
  ctrl: TestController,
  run: TestRun,
  parent: TestItem,
  file: CucumberFileEntry
) => {
  const id = `${parent.id}_${file.name}`
  const fileTest = getOrCreate(ctrl, parent.children, id, basename(file.name))
  const elements = file.file.map((e, i) =>
    processFeature(ctrl, run, fileTest, i, e)
  )

  const labels = elements.map((e) => e.id)
  removeMissingId(fileTest.children, labels)
  return fileTest
}

export const runCucumberConfiguration = async (
  ctrl: TestController,
  conf: WdIOConfiguration,
  parent: TestItem,
  run: TestRun
) => {
  run.started(parent)
  runonTestTree(parent, (k) => run.started(k))
  const files = await runWdIOConfigC(conf)
  const fileTests = files.map((file) => processFile(ctrl, run, parent, file))

  const labels = fileTests.map((f) => f.id)
  removeMissingId(parent.children, labels)
}
