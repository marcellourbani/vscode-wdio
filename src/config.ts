import { workspace } from "vscode"
const ROOT = "wdio"

export const runHeadless = () => {
  return workspace.getConfiguration(ROOT).get("headless") ?? true
}

export const configFileGlob = (): string => {
  return workspace.getConfiguration(ROOT).get("configfile") ?? "**/wdio.conf.js"
}
