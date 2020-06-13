import { SyncReader } from "binarin"

export enum Endian {
    Little = 0,
    Big = 1
}

// compatible layer
export default class BinaryReader {
    private buffer: Buffer
    public reader: SyncReader

    constructor(buffer: Buffer) {
        this.buffer = buffer
        this.reader = new SyncReader(new DataView(buffer))
    }

    get endian() {
        return this.reader.isLittleEndian ? Endian.Little : Endian.Big
    }

    set endian(e: Endian) {
        this.reader.isLittleEndian = e == Endian.Little ? true : false
    }

    get position() {
        return this.reader.pointer
    }

    set position(p: number) {
        this.reader.pointer = p
    }

    jump(position: number) {
        this.reader.pointer = position
    }

    skip(size: number) {
        this.reader.skip(size)
    }

    align(size: number) {
        this.reader.align(size)
    }

    read(size: number) {
        return new Buffer(this.reader.bytes(size))
    }

    readString(size: number) {
        const decoder = new TextDecoder("UTF-8")
        return decoder.decode(this.read(size))
    }

    string() {
        return this.reader.zeroTerminatedString()
    }

    int8S() {
        return this.reader.i8()
    }
    int8U() {
        return this.reader.u8()
    }

    int16S() {
        return this.reader.i16()
    }
    int16U() {
        return this.reader.u16()
    }

    int32S() {
        return this.reader.i32()
    }
    int32U() {
        return this.reader.u32()
    }

    int64S() {
        return this.reader.i64()
    }
    int64U() {
        return this.reader.u64()
    }

    safeInt64S() {
        const r = this.reader.i64()
        if (r > Number.MAX_SAFE_INTEGER) throw `too big`
        if (r < Number.MIN_SAFE_INTEGER) throw `too small`
        return Number(r)
    }

    safeInt64U() {
        const r = this.reader.u64()
        if (r > Number.MAX_SAFE_INTEGER) throw `too big`
        if (r < Number.MIN_SAFE_INTEGER) throw `too small`
        return Number(r)
    }

    float() {
        return this.reader.float()
    }

    double() {
        return this.reader.double()
    }
}