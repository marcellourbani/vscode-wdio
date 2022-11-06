import { workspace, Disposable, FileSystemWatcher } from "vscode"
import { getController, loadconfigurations } from "./wdio"
const ROOT = "wdio"
const CFGFILE = "configfile"
export const runHeadless = () => {
  return workspace.getConfiguration(ROOT).get("headless") ?? true
}

export const configFileGlob = (): string => {
  return workspace.getConfiguration(ROOT).get(CFGFILE) ?? "**/wdio.conf.[jt]s"
}

export const listenConfig = () =>
  workspace.onDidChangeConfiguration((c) => {
    if (c.affectsConfiguration(`${ROOT}.${CFGFILE}`))
      loadconfigurations(getController())
  })

export class FileWatcher extends Disposable {
  private static instance: FileWatcher
  watcher?: FileSystemWatcher

  static get() {
    if (!FileWatcher.instance) {
      FileWatcher.instance = new FileWatcher(() =>
        FileWatcher.instance?.watcher?.dispose()
      )
    }
    return FileWatcher.instance
  }

  setWatchers() {
    try {
      if (this.watcher) this.watcher.dispose()
      this.watcher = workspace.createFileSystemWatcher(configFileGlob())
      const refresh = () => loadconfigurations(getController())
      this.watcher.onDidChange(refresh)
      this.watcher.onDidCreate(refresh)
      this.watcher.onDidDelete(refresh)
    } catch (error) {}
  }
}
