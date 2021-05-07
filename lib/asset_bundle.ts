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
                    const data = reader.read(size)
                    const asset = new Asset(new Uint8Array(data), name, {})
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
                const head = new BinaryReader(new DataView(this.uncompress(reader.read(compressedBlockSize), uncompressedBlockSize, flags)))
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
                    const unCompData = this.uncompress(reader.read(block.c), block.u, block.flags)
                    rawData.set(new Uint8Array(unCompData), ptr)
                    ptr += unCompData.byteLength
                }

                // TODO: merge with UnityRaw
                var blobs: {[key: string]: Uint8Array} = {}
                for (let block of assetEntries) {
                    if (block.status === 4) continue
                    blobs[block.name] = rawData.slice(block.offset, block.size + block.offset)
                }
                for (let block of assetEntries) {
                    if (block.status !== 4) continue
                    const buf = rawData.slice(block.offset, block.size + block.offset)
                    const asset = new Asset(buf, block.name, blobs)
                    this.assets.push(asset)
                }
            }
            break
            default:
                throw new UnknownAssetBundleSignatureError(this.signature)
        }
    }

    uncompress(buffer: ArrayBuffer, max_dest_size: number, flags: number): ArrayBuffer {
        switch(flags & 0x3f) {
            case 0:
                return buffer
            case 2:
            case 3:
                var uncompBuffer = new Uint8Array(max_dest_size)
                uncompressBlock(new Uint8Array(buffer), uncompBuffer)
                return uncompBuffer.buffer
            default:
                console.warn("unknown flag: "+flags.toString(16))
                return buffer
        }
    }
}