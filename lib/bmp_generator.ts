export default function bmpGenerator(width: number, height: number, rgba: Uint8Array) {
    const offset = 70
    var buffer = Buffer.alloc(offset + (4 * width * height))

    buffer.write("BM", 0, 2)
    buffer.writeUInt32LE(buffer.length, 2) // bmp file length
    buffer.writeUInt32LE(0, 6) // reserved
    buffer.writeUInt32LE(offset, 10) // offset
    buffer.writeUInt32LE(offset - 14, 14) // header size
    buffer.writeUInt32LE(width, 18)
    buffer.writeUInt32LE(height, 22)
    buffer.writeUInt16LE(1, 26) // plane
    buffer.writeUInt16LE(32, 28) // bit of image
    buffer.writeUInt32LE(3, 30) // comperession type
    buffer.writeUInt32LE(0, 34) // image size
    buffer.writeUInt32LE(0xff, 38)
    buffer.writeUInt32LE(0xff, 42)
    buffer.writeUInt32LE(0, 46)
    buffer.writeUInt32LE(0, 50)
    buffer.writeUInt32LE(0x000000ff, 54)
    buffer.writeUInt32LE(0x0000ff00, 58)
    buffer.writeUInt32LE(0x00ff0000, 62)
    buffer.writeUInt32LE(0xff000000, 66)
    Buffer.from(rgba.buffer).copy(buffer, offset, 0, rgba.length-1)
    return buffer
}