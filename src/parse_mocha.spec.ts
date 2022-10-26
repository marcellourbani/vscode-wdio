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

suite(\`sui\${a}te2\`, () => { // bdd style
  test("test3", async () => {
      // your second test
  })
})`

  const results = extractMochaTests(source)
  expect(results.length).toBe(2)
  expect(results[0].title).toBe("suite1")
  expect(results[0].tests[1].start?.line).toBe(11)
  expect(results[1].tests.length).toBe(1)
  expect(results[1].tests[0].name).toBe("test3")
  expect(results[1].tests[0].start?.line).toBe(17)
})
