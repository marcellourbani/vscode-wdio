import { ExtensionContext, Disposable } from "vscode"
import { getController } from "./wdio"

export function activate(context: ExtensionContext) {
  context.subscriptions.push(getController())
}

// This method is called when your extension is deactivated
export function deactivate() {}
