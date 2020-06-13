import BinaryReader from "./binary_reader";
import string_table from "./constants/string_table";

export default class TypeTree {
    nodes: Node[] = []
    constructor(reader: BinaryReader) {
        const nodeCount = reader.int32U()
        const bufferSize = reader.int32U()
        const nodes = []
        for (let i = 0; i<nodeCount; i++) {
            nodes.push({
                version: reader.int16U(),
                depth: reader.int8U(),
                isArray: reader.int8U() != 0,
                type: reader.int32S(),
                name: reader.int32S(),
                size: reader.int32S(),
                index: reader.int32U(),
                flags: reader.int32U(),
            })
        }
        const bufferReader = new BinaryReader(reader.read(bufferSize))
        this.nodes = nodes.map(node => {
            var overwrite= {
                type: node.type.toString(),
                name: node.name.toString()
            }
            if (node.type >= 0) {
                bufferReader.jump(node.type)
                overwrite.type = bufferReader.string()
            } else {
                overwrite.type = string_table[(node.type + 2**31).toString()]
            }
            if (node.name >= 0) {
                bufferReader.jump(node.name)
                overwrite.name = bufferReader.string()
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