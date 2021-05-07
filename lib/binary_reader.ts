import { SyncReader } from "binarin"

export enum Endian {
    Little = 0,
    Big = 1
}

// compatible layer
export class BinaryReader extends SyncReader {
    // public reader: SyncReader

    // constructor(buffer: Uint8Array) {
    //     this.reader = new SyncReader(new DataView(buffer.buffer))
    // }

    get endian() {
        return this.isLittleEndian ? Endian.Little : Endian.Big
    }

    // set endian(e: Endian) {
    //     this.reader.isLittleEndian = e == Endian.Little ? true : false
    // }

    jump(position: number) {
        this.pointer = position
    }

    read(size: number) {
        return this.bytes(size)
    }

    readString(size: number) {
        const decoder = new TextDecoder("UTF-8")
        return decoder.decode(this.read(size))
    }

    bool() {
        return this.i8() !== 0
    }

    safeInt64S() {
        const r = this.i64()
        if (r > Number.MAX_SAFE_INTEGER) throw `too big`
        if (r < Number.MIN_SAFE_INTEGER) throw `too small`
        return Number(r)
    }

    safeInt64U() {
        const r = this.u64()
        if (r > Number.MAX_SAFE_INTEGER) throw `too big`
        if (r < Number.MIN_SAFE_INTEGER) throw `too small`
        return Number(r)
    }

}