import * as fs from "fs"
import * as lz4 from "@rinsuki/lz4-ts"
import * as path from "path"

const source = fs.readFileSync(process.argv[2])
const dst = new Uint8Array(lz4.compressBlockBound(source.byteLength))
const dstPath = process.argv[3]
const dstDir = path.dirname(dstPath)
if (dstDir !== "" && !fs.existsSync(dstDir)) fs.mkdirSync(dstDir, { recursive: true })
const length = lz4.compressBlockHC(source, dst, 0)
const s = `module.exports=require("../../utils").wasmB64("${Buffer.from(dst.slice(0, length)).toString("base64")}")`
fs.writeFileSync(dstPath, s)