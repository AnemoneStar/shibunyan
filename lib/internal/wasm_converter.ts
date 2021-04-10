import * as fs from "fs"
import * as lz4 from "@rinsuki/lz4-ts"

const source = fs.readFileSync(process.argv[2])
const dst = new Uint8Array(lz4.compressBlockBound(source.byteLength))
const length = lz4.compressBlockHC(source, dst, 0)
const s = `module.exports=require("../../utils").wasmB64("${Buffer.from(dst.slice(0, length)).toString("base64")}")`
fs.writeFileSync(process.argv[3], s)