import { BinaryReader } from "./binary_reader";
import { UnknownAssetBundleSignatureError, NotImplementedError } from "./error";
import { Asset } from "./asset";
import { times } from "./utils";
import { uncompressBlock } from "@rinsuki/lz4-ts"

export class AssetBundle {
    signature: string
    format: number
    unityVersion: string
    generatorVersion: string
    assets: Asset[] = []

    constructor(data: ArrayBufferView) {
        const reader = new BinaryReader(new DataView(data.buffer))
        this.signature = reader.zeroTerminatedString()
        this.format = reader.i32()
        this.unityVersion = reader.zeroTerminatedString()
        this.generatorVersion = reader.zeroTerminatedString()
        var assetEntries: {
            offset: number,
            size: number,
            status: number,
            name: string,
            isBlob: boolean
        }[] = []
        switch (this.signature) {
            case "UnityRaw": {
                const fileSize = reader.u32()
                const headerSize = reader.u32()
                reader.jump(headerSize)
                const assetCount = reader.u32()
                for (let i = 0; i < assetCount; i++) {
                    const position = reader.pointer
                    const name = reader.zeroTerminatedString()
                    const headerSize = reader.u32()
                    const size = reader.u32()
                    reader.jump(position + headerSize - 4)
                    const asset = new Asset(reader.bytesNoCopy(size), name, {})
                    this.assets.push(asset)
                }
            }
            break
            case "UnityFS": {
                const fileSize = reader.u64()
                const compressedBlockSize = reader.u32()
                const uncompressedBlockSize = reader.u32()
                const flags = reader.u32()
                if (this.format >= 7) reader.align(16)
                const uncompressed = new Uint8Array(uncompressedBlockSize)
                this.uncompress(reader.bytesNoCopy(compressedBlockSize), uncompressed, flags)
                const head = new BinaryReader(uncompressed)
                const guid = head.read(16)
                const blocks = times(head.u32(), () => ({
                    u: head.u32(),
                    c: head.u32(),
                    flags: head.u16()
                }))
                times(head.u32(), () => {
                    const entry = {
                        offset: head.safeInt64U(),
                        size: head.safeInt64U(),
                        status: head.u32(),
                        name: head.zeroTerminatedString(),
                    }
                    assetEntries.push({
                        ...entry,
                        isBlob: entry.status === 4,
                    })
                })

                const rawData = new Uint8Array(blocks.map(b => b.u).reduce((prev, current) => prev+current, 0))
                var ptr = 0
                
                for (let block of blocks) {
                    const data = reader.bytesNoCopy(block.c)
                    this.uncompress(data, rawData.subarray(ptr, ptr + block.u), block.flags)
                    ptr += block.u
                }

                // TODO: merge with UnityRaw
                var blobs: {[key: string]: Uint8Array} = {}
                for (let block of assetEntries) {
                    if (block.status === 4) continue
                    blobs[block.name] = rawData.subarray(block.offset, block.size + block.offset)
                }
                for (let block of assetEntries) {
                    if (block.status !== 4) continue
                    const buf = rawData.subarray(block.offset, block.size + block.offset)
                    const asset = new Asset(buf, block.name, blobs)
                    this.assets.push(asset)
                }
            }
            break
            default:
                throw new UnknownAssetBundleSignatureError(this.signature)
        }
    }

    uncompress(buffer: Uint8Array, output: Uint8Array, flags: number) {
        switch(flags & 0x3f) {
            case 0:
                output.set(buffer)
                break
            case 2:
            case 3:
                const uncompressed = uncompressBlock(buffer, output)
                if (uncompressed !== output.byteLength) throw new Error("uncompressed != output.byteLength")
                break
            default:
                console.warn("unknown flag: "+flags.toString(16))
                output.set(buffer)
                break
        }
    }
}