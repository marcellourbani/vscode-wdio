import { isLeft } from "fp-ts/Either"
import { Decoder } from "io-ts"
import reporter from "io-ts-reporters"
export const validate = <A>(d: Decoder<unknown, A>, x: unknown): A => {
  const decoded = d.decode(x)
  if (isLeft(decoded)) throw new Error(reporter.report(decoded).join("\n"))
  return decoded.right
}
