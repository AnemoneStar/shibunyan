import BinaryReader from "./binary_reader";
import { UnknownAssetBundleSignatureError, NotImplementedError } from "./error";
import Asset from "./asset";
import { times } from "./utils";
import { uncompressBlock } from "@rinsuki/lz4-ts"

export default class AssetBundle {
    signature: string
    format: number
    unityVersion: string
    generatorVersion: string
    assets: Asset[] = []
    constructor(data: Buffer) {
        const reader = new BinaryReader(data)
        this.signature = reader.string()
        this.format = reader.int32S()
        this.unityVersion = reader.string()
        this.generatorVersion = reader.string()
        switch (this.signature) {
            case "UnityRaw": {
                const fileSize = reader.int32U()
                const headerSize = reader.int32U()
                reader.jump(headerSize)
                const assetCount = reader.int32U()
                for (let i = 0; i < assetCount; i++) {
                    const position = reader.position
                    const name = reader.string()
                    const headerSize = reader.int32U()
                    const size = reader.int32U()
                    reader.jump(position + headerSize - 4)
                    const data = reader.read(size)
                    const asset = new Asset(data, name)
                    this.assets.push(asset)
                }
            }
            break
            case "UnityFS": {
                const fileSize = reader.int64U()
                const ciBlockSize = reader.int32U()
                const uiBlockSize = reader.int32U()
                const flags = reader.int32U()
                const head = new BinaryReader(this.uncompress(reader.read(ciBlockSize), uiBlockSize, flags))
                const guid = head.read(16)
                const blocks = times(head.int32U(), () => ({
                    u: head.int32U(),
                    c: head.int32U(),
                    flags: head.int16U()
                }))
                const assetBlocks = times(head.int32U(), () => { return {
                    offset: head.safeInt64U(),
                    size: head.safeInt64U(),
                    status: head.int32U(),
                    name: head.string(),
                }})
                console.log(blocks, assetBlocks)

                var rawData: Uint8Array = new Uint8Array(0)
                for (let block of blocks) {
                    console.log(block)
                    const unCompData = this.uncompress(reader.read(block.c), block.u, block.flags)
                    const newData = new Uint8Array(rawData.length + unCompData.length)
                    newData.set(rawData)
                    newData.set(unCompData, rawData.length)
                    rawData = newData
                }

                for ( let block of assetBlocks) {
                    console.log(block)
                    const buf = new Buffer(block.size)
                    buf.set(rawData.slice(block.offset, block.size))
                    const asset = new Asset(buf, block.name)
                    this.assets.push(asset)
                }
            }
            break
            default:
                throw new UnknownAssetBundleSignatureError(this.signature)
        }
        console.log(this)
    }

    uncompress(buffer: Buffer, max_dest_size: number, flags: number): Buffer {
        console.log(flags & 0x3f)
        switch(flags & 0x3f) {
            case 0:
                return buffer
            case 2:
            case 3:
                var uncompBuffer = new Buffer(max_dest_size)
                uncompressBlock(buffer, uncompBuffer)
                return uncompBuffer
            default:
                console.warn("unknown flag: "+flags.toString(16))
                return buffer
        }
    }
}