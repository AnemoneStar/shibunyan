import ObjectValue from "../object_value";
import { NotImplementedError } from "../error";
import BinaryReader from "../binary_reader";
import bmpGenerator from "../bmp_generator";
import { times } from "../utils";

export default class ImageDecoder {
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

        this.reader = new BinaryReader(this.bin)
        this.reader.endian = object["image data"].endian
        
        var d: Uint8Array | undefined

        switch (fmt) {
            case 3:
                d = this.decode_rgb24()
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
            re[i + 0] = this.reader.int8U()
            re[i + 1] = this.reader.int8U()
            re[i + 2] = this.reader.int8U()
            re[i + 3] = 255
        }
        return re
    }

    decode_rgb565() {
        const l = this.width * this.height * 4
        var re = new Uint8Array(l)
        for (let i = 0; i<l; i+=4) {
            const c = this.reader.int16U()
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
            const c = this.reader.int16U()
            re[i + 0] = (c & 0xf000) >> 8
            re[i + 1] = (c & 0x0f00) >> 4
            re[i + 2] = (c & 0x00f0)
            re[i + 3] = (c & 0x000f) << 4
        }
        return re
    }

    decode_etc1() {
        const l = this.width * this.height * 4
        var re = new Uint8Array(l)
        const bw = Math.floor((this.width + 3) / 4)
        const bh = Math.floor((this.height + 3) / 4)
        const br = new Uint8Array((bw * 4) * (bh * 4) * 4)
        times(bh, (by) => {
            by = by * 4
            times(bw, (bx) => {
                bx = bx * 4
                const block = this.decode_etc1_block(this.reader.read(8))
                // 24bit 4x4x3 = 48
                times(4, (y) => {
                    times(4, (x) => {
                        const loc = ((4 * x) + y) * 3
                        const b = 4 * (bx + x + ((bw * 4) * (by + y)))
                        times(3, (c) => {
                            br[b + c] = block[loc + c] & 0xff
                        })
                        br[b + 3] = 255
                    })
                })
            })
        })
        // TODO: ちゃんとリッピングする
        this.width = bw * 4
        this.height = bh * 4
        return br
    }

    Etc1ModifierTable = [[2, 8], [5, 17], [9, 29], [13, 42], [18, 60], [24, 80], [33, 106], [47, 183]]
    Etc1SubblockTable = [[0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1], [0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1]]

    decode_etc1_block(buf: ArrayBuffer) {
        const arr = new Uint8Array(buf)
        function hex(num: number): string {
            return ("0"+num.toString(16)).slice(-2)
        }
        const up = parseInt("0x"+hex(arr[0])+hex(arr[1])+hex(arr[2])+hex(arr[3]))
        const down = parseInt("0x"+hex(arr[4])+hex(arr[5])+hex(arr[6])+hex(arr[7]))
        const now = (leftpad(up.toString(2), 32) + leftpad(down.toString(2), 32))
        function leftpad(s: string, n: number) {
            return ("0".repeat(n) + s).slice(-n)
        }
        function shift(bit: number) {
            // return (up << (32-bit)) | (bit<32 ? (down >> bit): 0)
            return parseInt(now.slice(0, -bit).slice(-32), 2)
        }
        function bit(bit: number) {
            if (now.length != 64) console.log(now)
            return parseInt(now[63-bit])
        }
        function s(num: number, bit: number) {
            if (bit < 0) return parseInt(leftpad(num.toString(2), 32) + ("0".repeat(-bit)), 2)
            return parseInt(leftpad(num.toString(2), 64).slice(0, -bit), 2)
        }
        const colors: number[] = []
        const codes = [shift(37) & 7, shift(34) & 7]
        const subblocks = this.Etc1SubblockTable[bit(32)]
        if (bit(33) == 0) {
            colors[0] = shift(40) & 0xf0f0f0
            colors[0] = colors[0] | colors[0] >> 4
            colors[1] = shift(36) & 0xf0f0f0
            colors[1] = colors[1] | colors[1] >> 4
        } else {
            colors[0] = shift(40) & 0xf8f8f8
            const dr = (shift(56) & 3) - (shift(56) & 4)
            const dg = (shift(48) & 3) - (shift(48) & 4)
            const db = (shift(40) & 3) - (shift(40) & 4)
            colors[1] = colors[0] + (dr << 19) + (dg << 11) + (db << 3)
            colors[0] = colors[0] | (colors[0] >> 5 & 0x70707)
            colors[1] = colors[1] | (colors[1] >> 5 & 0x70707)
        }
        const mem = new Uint8Array(48)
        times(16, (i) => {
            const modifier = this.Etc1ModifierTable[codes[subblocks[i]]][bit(i)]
            const a = this.etc1colormod(colors[subblocks[i]], bit(i + 16) == 0 ? modifier : -modifier)
            mem[(i * 3) + 0] = a[0]
            mem[(i * 3) + 1] = a[1]
            mem[(i * 3) + 2] = a[2]
        })
        return mem
    }

    etc1colormod(color: number, modifier: number) {
        function f(number: number) {
            return Math.max(0, Math.min(255, number))
        }
        const r = f((color >> 16 & 0xff) + modifier)
        const g = f((color >> 8 & 0xff) + modifier)
        const b = f((color & 0xff) + modifier)
        return [r, g, b]
    }
}