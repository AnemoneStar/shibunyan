import BinaryReader from "./binary_reader";
import string_table from "./constants/string_table";

export default class TypeTree {
    nodes: Node[] = []
    constructor(reader: BinaryReader, version: number) {
        const nodeCount = reader.u32()
        const bufferSize = reader.u32()
        const nodes = []
        for (let i = 0; i<nodeCount; i++) {
            nodes.push({
                version: reader.u16(),
                depth: reader.u8(),
                isArray: reader.u8() != 0,
                type: reader.i32(),
                name: reader.i32(),
                size: reader.i32(),
                index: reader.u32(),
                flags: reader.u32(),
            })
        }
        const bufferReader = new BinaryReader(new DataView(reader.read(bufferSize)))
        this.nodes = nodes.map(node => {
            var overwrite= {
                type: node.type.toString(),
                name: node.name.toString()
            }
            if (node.type >= 0) {
                bufferReader.jump(node.type)
                overwrite.type = bufferReader.zeroTerminatedString()
            } else {
                overwrite.type = string_table[(node.type + 2**31).toString()]
            }
            if (node.name >= 0) {
                bufferReader.jump(node.name)
                overwrite.name = bufferReader.zeroTerminatedString()
            } else {
                overwrite.name = string_table[(node.name + 2**31).toString()]
            }
            return Object.assign(node, overwrite)
        })
    }
}

export interface Node {
    version: number
    depth: number
    isArray: boolean
    type: string
    name: string
    size: number
    index: number
    flags: number
}