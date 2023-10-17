import { window } from "vscode"

const wdio = window.createOutputChannel("WDIO")

const toString = (a: unknown) => {
  if (typeof a === "string") return a
  try {
    return JSON.stringify(a)
  } catch (error) {}
  try {
    return `${a}`
  } catch (error) {
    return "!!! tried to log invalid value"
  }
}

export const log = (...args: unknown[]) => {
  for (const a of args) wdio.appendLine(toString(a))
}
