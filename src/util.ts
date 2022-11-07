import { isLeft } from "fp-ts/Either"
import { Decoder } from "io-ts"
import { exec, spawnSync } from "child_process"

import reporter from "io-ts-reporters"
import { promisify } from "util"
import { TestController, TestItem, TestItemCollection, Uri } from "vscode"
import { sep } from "path"

export const validate = <A>(d: Decoder<unknown, A>, x: unknown): A => {
  const decoded = d.decode(x)
  if (isLeft(decoded)) throw new Error(reporter.report(decoded).join("\n"))
  return decoded.right
}

export const runCommand = (cmd: string, cwd?: string) =>
  promisify(exec)(cmd, { cwd })

export const normalizePath = (s: string) =>
  sep === "/" ? s : s.replace(/\\/g, "/")

export const runScript = (source: string, configFile: Uri, cwd?: string) => {
  const input = source.replace(/\\/g, "\\\\")
  const isTS = configFile.path.match(/\.ts$/)
  const prog = isTS ? "npx" : "node"
  const args = isTS ? ["-y", "ts-node", "-T"] : ["-"]
  const res = spawnSync(prog, args, { input, cwd, encoding: "utf-8" })
  if (res.error) throw res.error
  return res
}

export const isDefined = <T>(x: T | undefined): x is T =>
  typeof x !== "undefined"

export const runonTestTree = (root: TestItem, cb: (i: TestItem) => unknown) => {
  cb(root)
  for (const i of root.children) runonTestTree(i[1], cb)
}

export const hasStderr = (x: unknown): x is { stderr: string } =>
  !!x &&
  typeof x === "object" &&
  "stderr" in x &&
  typeof (x as any).stderr === "string"

export const hasMessage = (x: unknown): x is { message: string } =>
  !!x &&
  typeof x === "object" &&
  "message" in x &&
  typeof (x as any).message === "string"

export const getOrCreate = (
  ctrl: TestController,
  c: TestItemCollection,
  id: string,
  name: string,
  uri?: Uri
) => {
  const prev = c.get(id)
  if (prev && prev.label === name) return prev
  if (prev) c.delete(id)
  const test = ctrl.createTestItem(id, name, uri)
  c.add(test)
  return test
}

export const removeMissing = (
  entries: TestItemCollection,
  labels: string[]
) => {
  entries.forEach((item) => {
    const label = labels.find((l) => l === item.label)
    if (!label && label !== "") entries.delete(item.id)
  })
}

export const removeMissingId = (entries: TestItemCollection, ids: string[]) => {
  entries.forEach((item) => {
    const label = ids.find((l) => l === item.id)
    if (!label && label !== "") entries.delete(item.id)
  })
}

export const removeMissingTests = (
  entries: TestItemCollection,
  tests: TestItem[]
) => {
  entries.forEach((item) => {
    const test = tests.find((t) => t.id === item.id)
    if (!test) entries.delete(item.id)
  })
}
