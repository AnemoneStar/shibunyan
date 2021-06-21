import { BinaryReader, Endian } from "./binary_reader";
import { TypeTree, TypeTreeNode } from "./type_tree";
import { NotImplementedError, TypeTreeDefaultIsNotImplemented } from "./error";
import { CLASS_ID } from "./constants/class_id";
import { ObjectValue } from "./object_value";
import { safeBigIntToNumber } from "./utils";

function parseTypeTree(typeTree?: TypeTree): TypeTreeStack | undefined {
    if (typeTree == null) return
    const nodes = typeTree.nodes
    var tree: TypeTreeStack | undefined
    var stack: TypeTreeStack[] = []
    for (const node of nodes) {
        const self = {
            name: node.name,
            node,
            children: []
        }
        if (node.depth == 0) {
            tree = self
        } else {
            stack[node.depth - 1].children.push(self)
        }
        stack[node.depth] = self
    }
    return tree
}

export interface ParseObjectSimpleOptions {
    includeTypeTreeKey: boolean,
    useNullPrototype: boolean,
}

export class Asset {
    static readonly typeTreeKey = Symbol("Asset.typeTree")

    format: number
    generatorVersion: string
    targetPlatform: number
    endian: Endian = Endian.Big
    assetClasses: AssetClass[] = []
    objects: AssetObjectData[]
    objectsMap = new Map<bigint | number, AssetObjectData>()
    addIds: [number, (number | bigint)][] = []
    references: AssetReference[] = []
    comment: string = ""

    constructor(data: Uint8Array | ArrayBuffer | DataView, public name: string, public blobs: {[key: string]: Uint8Array | undefined}) {
        const reader = new BinaryReader(data)
        let metaSize = reader.u32()
        let fileSize: number | bigint = reader.u32()
        this.format = reader.u32()
        let dataOffset = reader.u32()
        if (this.format >= 9) {
            this.endian = reader.bool() ? Endian.Big : Endian.Little
            reader.skip(3)
        } else {
            reader.pointer = fileSize - metaSize
            this.endian = reader.bool() ? Endian.Big : Endian.Little
        }

        if (this.format >= 22) {
            const _metaSize = reader.u32()
            if (metaSize === 0) {
                metaSize = _metaSize
            } else if (_metaSize !== metaSize) {
                throw new Error(`metaSize !== _metaSize (metaSize=${metaSize}, _metaSize=${_metaSize})`)
            }
            const _fileSize = reader.u64()
            if (fileSize === 0) {
                fileSize = _fileSize
            } else if (_fileSize !== BigInt(fileSize)) {
                throw new Error(`fileSize !== _fileSize (fileSize=${fileSize}, _fileSize=${_fileSize})`)
            }
            const _dataOffset = reader.safeInt64S()
            if (dataOffset === 0) {
                dataOffset = _dataOffset
            } else if (_dataOffset !== dataOffset) {
                throw new Error(`dataOffset !== _dataOffset (dataOffset=${dataOffset}, _dataOffset=${_dataOffset})`)
            }
            reader.skip(8)
        }

        reader.isLittleEndian = this.endian == Endian.Little

        this.generatorVersion = this.format >= 7 ? reader.zeroTerminatedString() : ""
        this.targetPlatform = this.format >= 8 ? reader.i32() : -1
        const hasTypeTrees = this.format >= 13 ? reader.bool() : true
        const typeTreeCount = reader.u32()
        for (let i = 0; i<typeTreeCount; i++) {
            const classId = reader.i32()
            const stripped = this.format >= 16 ? reader.bool() : null
            const scriptId = this.format >= 17 ? reader.i16() : null
            const hash = this.format >= 13 ? (this.format < 16 ? classId < 0 : classId === 114) ? reader.readString(32) : reader.readString(16) : null
            const typeTree = hasTypeTrees ? new TypeTree(reader, this.format) : (() => {throw new TypeTreeDefaultIsNotImplemented("")})()
            this.assetClasses.push({
                classId,
                stripped,
                scriptId,
                hash,
                typeTree,
                parsedTypeTree: parseTypeTree(typeTree),
            })
        }
        const longObjectIds = this.format >= 14 ? true : this.format >= 7 ? reader.i32() !== 0 : false

        this.objects = []

        const objectCount = reader.u32()
        for (let i = 0; i<objectCount; i++) {
            if (this.format >= 14) reader.align(4)
            const pathId = longObjectIds ? reader.i64() : reader.i32()
            // if (Math.abs(pathId) > 2**53) throw new NotImplementedError("pathId > 2**53 ("+pathId+")")
            const offset = this.format >= 22 ? safeBigIntToNumber(reader.u64()) : reader.u32()
            const size = reader.u32()

            const now_pos = reader.pointer
            reader.jump(dataOffset + safeBigIntToNumber(offset))
            const data = reader.read(size)
            reader.pointer = now_pos

            const object: AssetObjectData = this.format >= 16
                ? {pathId, offset, size, typeId: null, classId: null, classIndex: reader.u32(), stripped: this.format === 16 ? reader.bool() : null, data}
                : {pathId, offset, size, typeId: reader.i32(), classId: reader.i16(), classIndex: null, destroyed: reader.i16() === 1, stripped: this.format === 15 ? reader.bool() : null, data}
            this.objects.push(object)
            this.objectsMap.set(object.pathId, object)
        }

        if (this.format >= 11) {
            const count = reader.u32()
            for (let i = 0; i<count; i++) {
                if (this.format >= 14) reader.align(4)
                this.addIds.push([reader.u32(), longObjectIds ? reader.i64() : reader.i32()])
            }
        }

        this.references = []
        const count = reader.u32()
        for (let i = 0; i<count; i++) {
            this.references.push({
                path: this.format >= 6 ? reader.zeroTerminatedString() : null,
                guid: this.format >= 5 ? new Uint8Array(reader.read(16)) : null,
                type: this.format >= 5 ? reader.i32() : null,
                filePath: reader.zeroTerminatedString(),
            })
        }

        if (this.format >= 5) this.comment = reader.zeroTerminatedString()
    }

    findAssetClass(obj: AssetObjectData) {
        return obj.classIndex != null
        ?   this.assetClasses[obj.classIndex]
        :   this.assetClasses.find(e => e.classId == obj.classId) || this.assetClasses.find(e => e.classId == obj.typeId)
    }

    objectType(obj: AssetObjectData) {
        const assetClass = this.findAssetClass(obj)
        if (assetClass && assetClass.typeTree && assetClass.typeTree.nodes[0]) {
            return assetClass.typeTree.nodes[0].type
        } else if (assetClass) {
            return CLASS_ID[assetClass.classId]
        }
        return undefined
    }

    parseObjectFromPathID(id: number | bigint) {
        const object = this.objectsMap.get(id)
        if (object == null) return
        return this.parseObject(object)
    }

    parseObject(obj: AssetObjectData) {
        const typeTreeStack = this.findAssetClass(obj)?.parsedTypeTree
        if (typeTreeStack == null) return undefined
        const reader = new BinaryReader(new DataView(obj.data))
        reader.isLittleEndian = this.endian == Endian.Little
        return this.parseObjectPrivate(reader, typeTreeStack)
    }

    private parseObjectPrivate(reader: BinaryReader, typeTree: TypeTreeStack): ObjectValue {
        var r: ObjectValue | undefined
        var node = typeTree.node
        var children = typeTree.children

        if (node.isArray) {
            var data: ObjectValue[] | Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array
            const size = this.parseObjectPrivate(reader, children.find(e => e.name == "size")!).value as number
            const dataTypeTree = children.find(e => e.name == "data")!
            // TODO: support more types
            if (dataTypeTree.node.type === "char" || dataTypeTree.node.type === "UInt8") {
                data = new Uint8Array(reader.read(size))
            } else if (dataTypeTree.node.type == "UInt16" || dataTypeTree.node.type == "unsigned short") {
                data = new Uint16Array(reader.read(size * 2))
            } else if (dataTypeTree.node.type == "UInt32" || dataTypeTree.node.type == "unsigned int") {
                data = new Uint32Array(reader.read(size * 4))
            } else if (dataTypeTree.node.type == "SInt32" || dataTypeTree.node.type == "int") {
                data = new Int32Array(reader.read(size * 4))
            } else if (dataTypeTree.node.type == "float") {
                data = new Float32Array(reader.read(size * 4))
            } else {
                let arr = []
                for (let i = 0; i<size; i++) {
                    arr.push(this.parseObjectPrivate(reader, dataTypeTree))
                }
                if (node.type == "TypelessData") throw new NotImplementedError("typelessdata")
                data = arr
            }
            r = new ObjectValue(
                node.name,
                node.type,
                reader.endian,
                data,
            )
        } else if (node.size == -1) {
            r = new ObjectValue(node.name, node.type, reader.endian)
            if (children.length == 1 && children[0].name == "Array" && children[0].node.type == "Array" && children[0].node.isArray) {
                r.value = this.parseObjectPrivate(reader, children[0]).value
                if (node.type == "string") {
                    const decoder = new TextDecoder()
                    r.value = decoder.decode(r.value)
                }
            } else {
                for (const child of children) {
                    r![child.name] = this.parseObjectPrivate(reader, child)
                }
            }
        } else if (children.length > 0) {
            const pos = reader.pointer
            r = new ObjectValue(node.name, node.type, reader.endian)
            r.isStruct = true
            for (const child of children) {
                r![child.name] = this.parseObjectPrivate(reader, child)
            }
        } else {
            const pos = reader.pointer
            var value = 
                node.type == "bool" ? reader.i8() != 0
            :   node.type == "SInt8" ? reader.i8()
            :   node.type == "UInt8" || node.type == "char" ? reader.u8()
            :   node.type == "SInt16" || node.type == "short" ? reader.i16()
            :   node.type == "UInt16" || node.type == "unsigned short" ? reader.u16()
            :   node.type == "SInt32" || node.type == "int" ? reader.i32()
            :   node.type == "UInt32" || node.type == "unsigned int" ? reader.u32()
            :   node.type == "SInt64" || node.type == "long long" ? reader.i64()
            :   node.type == "UInt64" || node.type == "unsigned long long" ? reader.u64()
            :   node.type == "float" ? reader.float()
            :   node.type == "double" ? reader.double()
            :   node.type == "ColorRGBA" ? [reader.u8(), reader.u8(), reader.u8(), reader.u8()]
            :   reader.read(node.size)
            reader.jump(pos + node.size)
            r = new ObjectValue(node.name, node.type, reader.endian, value)
        }
        if (r.type === "StreamingInfo") {
            r.value = this.solveStreamingData(r)
        }
        if ((node.flags & 0x4000) != 0) reader.align(4)
        return r
    }

    parseObjectSimple(obj: AssetObjectData, options: Partial<ParseObjectSimpleOptions> = {}) {
        const typeTreeStack = this.findAssetClass(obj)?.parsedTypeTree
        if (typeTreeStack == null) return undefined
        const reader = new BinaryReader(new DataView(obj.data))
        reader.isLittleEndian = this.endian == Endian.Little
        return this.parseObjectSimplePrivate(reader, typeTreeStack, {
            includeTypeTreeKey: options.includeTypeTreeKey ?? false,
            useNullPrototype: options.useNullPrototype ?? false,
        })
    }

    private parseObjectSimplePrivate(reader: BinaryReader, typeTree: TypeTreeStack, options: ParseObjectSimpleOptions): any {
        var node = typeTree.node
        var children = typeTree.children
        var res: any = options.useNullPrototype ? Object.create(null) : {}
        if (options.includeTypeTreeKey) res[Asset.typeTreeKey] = typeTree
        var resIsObject = true

        if (node.isArray) {
            var data: ObjectValue[] | Uint8Array | Uint16Array | Uint32Array | Int32Array | Float32Array
            const size = this.parseObjectPrivate(reader, children.find(e => e.name == "size")!).value as number
            const dataTypeTree = children.find(e => e.name == "data")!
            // TODO: support more types
            if (dataTypeTree.node.type === "char" || dataTypeTree.node.type === "UInt8") {
                data = new Uint8Array(reader.read(size))
            } else if (dataTypeTree.node.type == "UInt16" || dataTypeTree.node.type == "unsigned short") {
                data = new Uint16Array(reader.read(size * 2))
            } else if (dataTypeTree.node.type == "UInt32" || dataTypeTree.node.type == "unsigned int") {
                data = new Uint32Array(reader.read(size * 4))
            } else if (dataTypeTree.node.type == "SInt32" || dataTypeTree.node.type == "int") {
                data = new Int32Array(reader.read(size * 4))
            } else if (dataTypeTree.node.type == "float") {
                data = new Float32Array(reader.read(size * 4))
            } else {
                let arr = []
                for (let i = 0; i<size; i++) {
                    arr.push(this.parseObjectSimplePrivate(reader, dataTypeTree, options))
                }
                if (node.type == "TypelessData") throw new NotImplementedError("typelessdata")
                data = arr
            }
            res = data
        } else if (node.size == -1) {
            if (children.length == 1 && children[0].name == "Array" && children[0].node.type == "Array" && children[0].node.isArray) {
                res = this.parseObjectSimplePrivate(reader, children[0], options)
                if (node.type == "string") {
                    const decoder = new TextDecoder()
                    res = decoder.decode(res)
                    resIsObject = false
                }
            } else {
                for (const child of children) {
                    res[child.name] = this.parseObjectSimplePrivate(reader, child, options)
                }
            }
        } else if (children.length > 0) {
            const pos = reader.pointer
            for (const child of children) {
                res[child.name] = this.parseObjectSimplePrivate(reader, child, options)
            }
        } else {
            const pos = reader.pointer
            var value = 
                node.type == "bool" ? reader.i8() != 0
            :   node.type == "SInt8" ? reader.i8()
            :   node.type == "UInt8" || node.type == "char" ? reader.u8()
            :   node.type == "SInt16" || node.type == "short" ? reader.i16()
            :   node.type == "UInt16" || node.type == "unsigned short" ? reader.u16()
            :   node.type == "SInt32" || node.type == "int" ? reader.i32()
            :   node.type == "UInt32" || node.type == "unsigned int" ? reader.u32()
            :   node.type == "SInt64" || node.type == "long long" ? reader.i64()
            :   node.type == "UInt64" || node.type == "unsigned long long" ? reader.u64()
            :   node.type == "float" ? reader.float()
            :   node.type == "double" ? reader.double()
            :   node.type == "ColorRGBA" ? [reader.u8(), reader.u8(), reader.u8(), reader.u8()]
            :   reader.read(node.size)
            reader.jump(pos + node.size)
            res = value
        }
        if (node.type === "StreamingInfo") {
            res = this.solveStreamingDataSimple(res)
        } else if (node.type === "map") {
            res = new Map(res.map(({first, second}: any) => [first, second]))
            if (options.includeTypeTreeKey) res[Asset.typeTreeKey] = typeTree
        }
        if ((node.flags & 0x4000) != 0) reader.align(4)
        return res
    }

    solveStreamingData(r: ObjectValue) {
        let path = r["path"].value
        if (typeof path !== "string") return
        const prefix = `archive:/${this.name}/`
        if (path.startsWith(prefix)) path = path.slice(prefix.length)
        if (path === "") return
        const blob = this.blobs[path]
        if (blob == null) return
        const offset = r["offset"].value
        if (typeof offset !== "number" && typeof offset !== "bigint") return
        const size = r["size"].value
        if (typeof size !== "number" && typeof size !== "bigint") return
        return blob.slice(safeBigIntToNumber(offset), safeBigIntToNumber(offset) + safeBigIntToNumber(size))
    }

    solveStreamingDataSimple(r: any) {
        let path = r.path
        if (typeof path !== "string") return
        const prefix = `archive:/${this.name}/`
        if (path.startsWith(prefix)) path = path.slice(prefix.length)
        if (path === "") return
        const blob = this.blobs[path]
        if (blob == null) return
        const offset = r.offset
        if (typeof offset !== "number" && typeof offset !== "bigint") return
        const size = r.size
        if (typeof size !== "number" && typeof size !== "bigint") return
        return blob.slice(safeBigIntToNumber(offset), safeBigIntToNumber(offset) + safeBigIntToNumber(size))
    }
}

export interface TypeTreeStack {
    name: string
    node: TypeTreeNode
    children: TypeTreeStack[]
}

export interface AssetClass {
    classId: number
    stripped: boolean | null
    scriptId: number | null
    hash: string | null
    typeTree: TypeTree
    parsedTypeTree?: TypeTreeStack
}

export interface AssetObjectData {
    pathId: number | bigint
    offset: number
    size: number
    typeId: number | null
    classId: number | null
    classIndex: number | null
    stripped: boolean | null
    destroyed?: boolean
    data: ArrayBuffer
}

export interface AssetReference {
    path: string | null
    guid: Uint8Array | null
    type: number | null
    filePath: string
}