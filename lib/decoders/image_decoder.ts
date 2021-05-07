import { ObjectValue } from "../object_value";
import { NotImplementedError } from "../error";
import { BinaryReader, Endian } from "../binary_reader";
import { bmpGenerator } from "../bmp_generator";
import { WASM_PAGE_SIZE } from "../utils";
import etc2Decoder = require("./wasm/etc2");

const Etc1ModifierTable = [[2, 8], [5, 17], [9, 29], [13, 42], [18, 60], [24, 80], [33, 106], [47, 183]]
const Etc1SubblockTable = [[0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]]

export class ImageDecoder {
    endian: number
    width: number
    height: number
    bin: Uint8Array
    reader: BinaryReader
    rgba: Uint8Array
    
    constructor(object: ObjectValue) {
        this.endian = object.endian
        this.width = object.m_Width.value
        this.height = object.m_Height.value
        this.bin = new Uint8Array(object["image data"].value)
        if (this.bin.length === 0 && object.m_StreamData != null && object.m_StreamData.value != null) this.bin = new Uint8Array(object.m_StreamData.value)
        const fmt = object["m_TextureFormat"].value

        this.reader = new BinaryReader(new DataView(this.bin.buffer))
        this.reader.isLittleEndian = object["image data"].endian == Endian.Little
        
        var d: Uint8Array | undefined

        switch (fmt) {
            case 3:
                d = this.decode_rgb24()
                break
            case 4:
                d = this.decode_rgba32()
                break
            case 7:
                d = this.decode_rgb565()
                break
            case 13:
                d = this.decode_rgba4444()
                break
            case 34:
                d = this.decode_etc1()
                break
            case 47:
                d = this.decode_etc2rgba8()
                break
            default:
                throw new NotImplementedError("image fmt: "+fmt)
        }

        this.rgba = d
    }

    bmp() {
        return bmpGenerator(this.width, this.height, this.rgba)
    }

    decode_rgb24() {
        const l = this.width * this.height * 4
        var re = new Uint8Array(l)
        for (let i=0; i<l; i+=4) {
            re[i + 0] = this.reader.u8()
            re[i + 1] = this.reader.u8()
            re[i + 2] = this.reader.u8()
            re[i + 3] = 255
        }
        return re
    }

    decode_rgba32() {
        return this.bin
    }

    decode_rgb565() {
        const l = this.width * this.height * 4
        var re = new Uint8Array(l)
        for (let i = 0; i<l; i+=4) {
            const c = this.reader.u16()
            re[i + 0] = (c & 0b1111100000000000) >> 8
            re[i + 1] = (c & 0b0000011111100000) >> 3
            re[i + 2] = (c & 0b0000000000011111) << 3
            re[i + 3] = 255
        }
        return re
    }

    decode_rgba4444() {
        const l = this.width * this.height * 4
        var re = new Uint8Array(l)
        for (let i = 0; i<l; i+=4) {
            const c = this.reader.u16()
            re[i + 0] = (c & 0xf000) >> 8
            re[i + 1] = (c & 0x0f00) >> 4
            re[i + 2] = (c & 0x00f0)
            re[i + 3] = (c & 0x000f) << 4
        }
        return re
    }

    decode_etc1() {
        const bw = Math.floor((this.width + 3) / 4)
        const bh = Math.floor((this.height + 3) / 4)
        const br = new Uint8ClampedArray((bw * 4) * (bh * 4) * 4)
        const reader = new DataView(this.bin.buffer)
        let c = -4
        for (let i=3; i<br.length; i+=4) {
            br[i] = 255
        }
        for (let by_ = 0; by_ < bh; by_++) {
            const by = by_ * 4
            for (let bx_ = 0; bx_ < bw; bx_++) {
                const bx = bx_ * 4
                const up = reader.getUint32(c+=4, false), down=reader.getUint32(c+=4, false)
                const codes = [up >> 5 & 7, up >> 2 & 7]
                const subblocks = Etc1SubblockTable[up & 1]
                let color0 = 0, color1 = 0
                if (up & 2) {
                    color0 = up >> 8 & 0xf8f8f8
                    const dr = (up >> 24 & 3) - (up >> 24 & 4)
                    const dg = (up >> 16 & 3) - (up >> 16 & 4)
                    const db = (up >> 8 & 3) - (up >> 8 & 4)
                    color1 = color0 + (dr << 19) + (dg << 11) + (db << 3)
                    color0 = color0 | (color0 >> 5 & 0x70707)
                    color1 = color1 | (color1 >> 5 & 0x70707)
                } else {
                    color0 = up >> 8 & 0xf0f0f0
                    color0 = color0 | color0 >> 4
                    color1 = up >> 4 & 0xf0f0f0
                    color1 = color1 | color1 >> 4
                }
                for (let x=0; x<4; x++) {
                    for (let y=0; y<4; y++) {
                        const i = (x * 4) + y
                        const b = 4 * (bx + x + ((bw * 4) * (by + y)))
                        const modifier_ = Etc1ModifierTable[codes[subblocks[i]]][(down >> i) & 1]
                        const color = subblocks[i] ? color1 : color0
                        const modifier = ((down >> (i + 16)) & 1) == 0 ? modifier_ : -modifier_
                        br[b + 0] = (color >> 16 & 0xff) + modifier
                        br[b + 1] = (color >> 8 & 0xff) + modifier
                        br[b + 2] = (color & 0xff) + modifier
                    }
                }
            }
        }
        // TODO: ちゃんとリッピングする
        this.width = bw * 4
        this.height = bh * 4
        return new Uint8Array(br.buffer)
    }

    decode_etc2rgba8() {
        const width = (this.width + 3) & ~0b11
        const height = (this.height + 3) & ~0b11
        this.width = width
        this.height = height

        const { exports: instance } = etc2Decoder.instance()
        const inputSize = this.bin.byteLength
        const outputSize = width * height * 4
        const inputStart = instance.memory.grow(Math.ceil((inputSize + outputSize) / WASM_PAGE_SIZE)) * WASM_PAGE_SIZE
        const outputStart = inputStart + inputSize
        new Uint8Array(instance.memory.buffer).set(this.bin, inputStart)
        console.log(inputStart, inputSize, outputSize, inputStart + inputSize + outputSize, instance.memory.buffer.byteLength)
        instance.decode_etc2a8(inputStart, outputStart, width, height)
        return new Uint8Array(instance.memory.buffer.slice(outputStart, outputStart + outputSize))
    }
}