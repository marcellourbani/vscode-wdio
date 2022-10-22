import { commands, ExtensionContext, window, Disposable } from "vscode"
import { runTests, getController } from "./wdio"

export function activate(context: ExtensionContext) {
  const addSubscription = (d: Disposable) => context.subscriptions.push(d)
  addSubscription(getController())
  addSubscription(commands.registerCommand("vscode-wdio.runTests", runTests))
}

// This method is called when your extension is deactivated
export function deactivate() {}
