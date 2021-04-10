import * as fs from "fs"

const source = fs.readFileSync(process.argv[2])
const s = `module.exports=require("../../utils").wasmB64("${Buffer.from(source).toString("base64")}")`
fs.writeFileSync(process.argv[3], s)