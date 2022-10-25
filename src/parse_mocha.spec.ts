import { extractMochaTests } from "./parse_mocha"

test("extract tests from source,simple", () => {
  const source = `
describe("suite1", () => {
  before(async () => {
      // initialization
  })

  it("test1", async () => {
      // your first test
  })

  it("test2", async () => {
      // your second test
  })
})

describe(\`sui\${a}te2\`, () => {
  it("test3", async () => {
      // your second test
  })
})`

  const results = extractMochaTests(source)
  expect(results.length).toBe(2)
})
