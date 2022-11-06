import { ExtensionContext } from "vscode"
import { FileWatcher, listenConfig } from "./config"
import { getController } from "./wdio"

export function activate(context: ExtensionContext) {
  context.subscriptions.push(FileWatcher.get())
  context.subscriptions.push(getController())
  context.subscriptions.push(listenConfig())
}

// This method is called when your extension is deactivated
export function deactivate() {}
