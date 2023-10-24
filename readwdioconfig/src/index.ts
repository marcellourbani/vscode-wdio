import { ConfigParser } from "@wdio/config"

const main = async () => {
  const parser = new ConfigParser(process.argv[2])
  await parser.initialize()
  const config = parser.getConfig()
  console.log(config)
}

main()
