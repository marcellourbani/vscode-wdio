import { workspace } from "vscode"
import { getController, loadconfigurations } from "./wdio"
const ROOT = "wdio"
const CFGFILE = "configfile"
export const runHeadless = () => {
  return workspace.getConfiguration(ROOT).get("headless") ?? true
}

export const configFileGlob = (): string => {
  return workspace.getConfiguration(ROOT).get(CFGFILE) ?? "**/wdio.conf.js"
}

export const listenConfig = () =>
  workspace.onDidChangeConfiguration((c) => {
    if (c.affectsConfiguration(`${ROOT}.${CFGFILE}`))
      loadconfigurations(getController())
  })
