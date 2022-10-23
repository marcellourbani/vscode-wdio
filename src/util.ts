import { isLeft } from "fp-ts/Either"
import { Decoder } from "io-ts"
import { exec, spawnSync } from "child_process"

import reporter from "io-ts-reporters"
import { promisify } from "util"

export const validate = <A>(d: Decoder<unknown, A>, x: unknown): A => {
  const decoded = d.decode(x)
  if (isLeft(decoded)) throw new Error(reporter.report(decoded).join("\n"))
  return decoded.right
}

export const runCommand = (cmd: string, cwd?: string) =>
  promisify(exec)(cmd, { cwd })

export const runScript = (source: string, cwd?: string) => {
  const { stdout } = spawnSync("node", ["-"], {
    input: source,
    cwd,
    encoding: "utf-8"
  })
  return stdout
}
