import { parse } from "@babel/parser"
import { CallExpression, Node } from "@babel/types"

const callTo = (s: Node, functionPattern: string): CallExpression | undefined =>
  s.type === "ExpressionStatement" &&
  s.expression.type === "CallExpression" &&
  s.expression.callee.type === "Identifier" &&
  s.expression.callee.name.match(functionPattern)
    ? s.expression
    : undefined

const nameFromParam = (n?: Node) => {
  if (n?.type === "StringLiteral") return n.value
  if (n?.type === "TemplateLiteral")
    return n.quasis
      .filter((q) => q.type === "TemplateElement")
      .map((q) => q.value.cooked || q.value.raw)
      .join("..")
  return ""
}

const parseStatement = (s: CallExpression) => {
  const { start, end } = s.loc || {}
  const name = nameFromParam(s.arguments[0])

  return { name, start, end }
}

const parseSuite = (s: CallExpression) => {
  const [rawTitle, rawcb] = s.arguments || []
  const title = nameFromParam(rawTitle)
  if (rawcb?.type !== "ArrowFunctionExpression") return
  if (rawcb?.body.type !== "BlockStatement") return
  const tests = []
  for (const node of rawcb.body.body) {
    const testcall = callTo(node, "it|test")
    if (testcall) {
      const test = parseStatement(testcall)
      if (test) tests.push(test)
    }
  }
  return { title, line: s.loc?.start.line, tests }
}

export const extractMochaTests = (source: string) => {
  const tree = parse(source)
  console.log(tree)
  const suites = []
  for (const node of tree.program.body) {
    const suitecall = callTo(node, "describe|suite")
    if (suitecall) {
      const suite = parseSuite(suitecall)
      if (suite) suites.push(suite)
    }
  }
  return suites
}
