import { ExtensionContext, Disposable } from "vscode"
import { getController } from "./wdio"

export function activate(context: ExtensionContext) {
  const addSubscription = (d: Disposable) => context.subscriptions.push(d)
  addSubscription(getController())
}

// This method is called when your extension is deactivated
export function deactivate() {}
