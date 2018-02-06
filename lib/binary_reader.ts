export enum Endian {
    Little = 0,
    Big = 1
}
export default class BinaryReader {
    private buffer: Buffer
    public endian: Endian = Endian.Big
    public position: number = 0

    constructor(buffer: Buffer) {
        this.buffer = buffer
    }

    jump(position: number) {
        this.position = position
    }

    skip(size: number) {
        this.position += size
    }

    align(size: number) {
        this.position = Math.floor((this.position + size - 1) / size) * size
    }

    read(size: number) {
        const data = this.buffer.slice(this.position, this.position + size)
        this.position += size
        return data
    }
    readString(size: number) {
        return this.read(size).toString("utf-8")
    }

    string() {
        var readData = -1
        var arr = []
        while (readData = this.int8U()) {
            arr.push(readData)
        }
        return Buffer.from(arr).toString("utf-8")
    }

    int8S() {
        const data = this.buffer.readInt8(this.position)
        this.position++
        return data
    }
    int8U() {
        const data = this.buffer.readUInt8(this.position)
        this.position++
        return data
    }

    int16S() {
        const data = (this.endian ? this.buffer.readInt16BE : this.buffer.readInt16LE).call(this.buffer, this.position) as number
        this.position += 2
        return data
    }
    int16U() {
        const data = (this.endian ? this.buffer.readUInt16BE : this.buffer.readUInt16LE).call(this.buffer, this.position) as number
        this.position += 2
        return data
    }

    int32S() {
        const data = (this.endian ? this.buffer.readInt32BE: this.buffer.readInt32LE).call(this.buffer, this.position) as number
        this.position += 4
        return data
    }
    int32U() {
        const data = (this.endian ? this.buffer.readUInt32BE : this.buffer.readUInt32LE).call(this.buffer, this.position) as number
        this.position += 4
        return data
    }

    int64S() {
        const data = (this.endian ? this.buffer.readIntBE : this.buffer.readIntLE).call(this.buffer, this.position, 8) as number
        this.position += 8
        return data
    }
    int64U() {
        const data = (this.endian ? this.buffer.readUIntBE : this.buffer.readUIntLE).call(this.buffer, this.position, 8) as number
        this.position += 8
        return data
    }

    float() {
        const data = (this.endian ? this.buffer.readFloatBE : this.buffer.readFloatLE).call(this.buffer, this.position) as number
        this.position += 4
        return data
    }

    double() {
        const data = (this.endian ? this.buffer.readDoubleBE : this.buffer.readDoubleLE).call(this.buffer, this.position) as number
        this.position += 8
        return data
    }
}