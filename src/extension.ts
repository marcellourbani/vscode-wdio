import { ExtensionContext } from "vscode"
import { listenConfig } from "./config"
import { getController } from "./wdio"

export function activate(context: ExtensionContext) {
  context.subscriptions.push(getController())
  context.subscriptions.push(listenConfig())
}

// This method is called when your extension is deactivated
export function deactivate() {}
