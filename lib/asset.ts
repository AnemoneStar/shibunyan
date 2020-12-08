import BinaryReader, { Endian } from "./binary_reader";
import TypeTree, { Node } from "./type_tree";
import { NotImplementedError, TypeTreeDefaultIsNotImplemented } from "./error";
import class_id from "./constants/class_id";
import ObjectValue from "./object_value";
import { safeBigIntToNumber } from "./utils";

export default class Asset {
    format: number
    generatorVersion: string
    targetPlatform: number
    endian: Endian = Endian.Big
    assetClasses: AssetClass[]
    objects: AssetObjectData[]
    addIds: (number | bigint)[][] = []
    references: AssetReference[] = []
    comment: string = ""

    constructor(data: Uint8Array, public name: string) {
        const reader = new BinaryReader(data)
        const metaSize = reader.int32U()
        const fileSize = reader.int32U()
        this.format = reader.int32U()
        const dataOffset = reader.int32U()
        if (this.format >= 9) {
            this.endian = reader.bool() ? Endian.Big : Endian.Little
            reader.skip(3)
        } else {
            reader.position = fileSize - metaSize
            this.endian = reader.bool() ? Endian.Big : Endian.Little
        }

        if (this.format >= 22) {
            const _metaSize = reader.int32U()
            if (_metaSize !== metaSize) throw new Error("metaSize !== _metaSize")
            const _fileSize = reader.int64U()
            if (_fileSize !== BigInt(fileSize)) throw new Error("fileSize !== _fileSize")
            const _dataOffset = reader.int64U()
            if (_dataOffset !== BigInt(dataOffset)) throw new Error("dataOffset !== _dataOffset")
            reader.skip(4)
        }

        reader.endian = this.endian

        this.generatorVersion = this.format >= 7 ? reader.string() : ""
        this.targetPlatform = this.format >= 8 ? reader.int32S() : -1
        this.assetClasses = []
        const hasTypeTrees = this.format >= 13 ? reader.bool() : true
        const typeTreeCount = reader.int32U()
        for (let i = 0; i<typeTreeCount; i++) {
            const classId = reader.int32S()
            const stripped = this.format >= 16 ? reader.int8U() : null
            const scriptId = this.format >= 17 ? reader.int16S() : null
            const hash = this.format >= 13 ? (this.format < 16 ? classId < 0 : classId === 114) ? reader.readString(32) : reader.readString(16) : null
            const typeTree = hasTypeTrees ? new TypeTree(reader, this.format) : (() => {throw new TypeTreeDefaultIsNotImplemented("")})()
            this.assetClasses.push({
                classId,
                stripped,
                scriptId,
                hash,
                typeTree,
            })
        }
        const longObjectIds = this.format >= 14 ? true : this.format >= 7 ? reader.int32S() !== 0 : false

        this.objects = []

        const objectCount = reader.int32U()
        for (let i = 0; i<objectCount; i++) {
            if (this.format >= 14) reader.align(4)
            const pathId = longObjectIds ? reader.int64S() : reader.int32S()
            // if (Math.abs(pathId) > 2**53) throw new NotImplementedError("pathId > 2**53 ("+pathId+")")
            const offset = this.format >= 22 ? safeBigIntToNumber(reader.int64U()) : reader.int32U()
            const size = reader.int32U()

            const now_pos = reader.position
            reader.jump(dataOffset + safeBigIntToNumber(offset))
            const data = reader.read(size)
            reader.position = now_pos

            const object: AssetObjectData = this.format >= 16
                ? {pathId, offset, size, typeId: null, classId: null, classIndex: reader.int32U(), stripped: this.format === 16 ? reader.bool() : null, data}
                : {pathId, offset, size, typeId: reader.int32S(), classId: reader.int16S(), classIndex: null, destroyed: reader.int16S() === 1, stripped: this.format === 15 ? reader.bool() : null, data}
            this.objects.push(object)
        }

        if (this.format >= 11) {
            const count = reader.int32U()
            for (let i = 0; i<count; i++) {
                if (this.format >= 14) reader.align(4)
                this.addIds.push([reader.int32U(), longObjectIds ? reader.int64S() : reader.int32S()])
            }
        }

        this.references = []
        const count = reader.int32U()
        for (let i = 0; i<count; i++) {
            this.references.push({
                path: this.format >= 6 ? reader.string() : null,
                guid: this.format >= 5 ? reader.read(16) : null,
                type: this.format >= 5 ? reader.int32S() : null,
                filePath: reader.string(),
            })
        }

        if (this.format >= 5) this.comment = reader.string()
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
            return class_id[assetClass.classId]
        }
        return undefined
    }

    parseObject(obj: AssetObjectData) {
        const assetClass = this.findAssetClass(obj)
        if (!assetClass) return undefined
        const typeTree = Asset.parseTypeTree(assetClass)
        if (!typeTree) return undefined
        const reader = new BinaryReader(obj.data)
        reader.endian = this.endian
        return this.parseObjectPrivate(reader, typeTree)
    }

    private parseObjectPrivate(reader: BinaryReader, typeTree: TypeTreeStack): ObjectValue {
        var r: ObjectValue | undefined
        var node = typeTree.node
        var children = typeTree.children

        if (node.isArray) {
            var data = []
            const size = this.parseObjectPrivate(reader, children.find(e => e.name == "size")!).value as number
            const dataTypeTree = children.find(e => e.name == "data")!
            for (let i = 0; i<size; i++) {
                data.push(this.parseObjectPrivate(reader, dataTypeTree))
            }
            // if (node.type == "TypelessData") throw new NotImplementedError("typelessdata")
            if (node.type == "TypelessData") data = data.map(e => e.value as number)
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
                // if (node.type == "string") r.value = r.value.map(e => e.value)
                if (node.type == "string") new NotImplementedError("node.type == string")
            } else {
                children.forEach(child => {
                    r![child.name] = this.parseObjectPrivate(reader, child)
                })
            }
        } else if (children.length > 0) {
            const pos = reader.position
            r = new ObjectValue(node.name, node.type, reader.endian)
            r.isStruct = true
            children.forEach(child => {
                r![child.name] = this.parseObjectPrivate(reader, child)
            })
        } else {
            const pos = reader.position
            var value = 
                node.type == "bool" ? reader.int8S() != 0
            :   node.type == "SInt8" ? reader.int8S()
            :   node.type == "UInt8" || node.type == "char" ? reader.int8U()
            :   node.type == "SInt16" || node.type == "short" ? reader.int16S()
            :   node.type == "UInt16" || node.type == "unsigned short" ? reader.int16U()
            :   node.type == "SInt32" || node.type == "int" ? reader.int32S()
            :   node.type == "UInt32" || node.type == "unsigned int" ? reader.int32U()
            :   node.type == "SInt64" || node.type == "long long" ? reader.int64S()
            :   node.type == "UInt64" || node.type == "unsigned long long" ? reader.int64U()
            :   node.type == "float" ? reader.float()
            :   node.type == "double" ? reader.double()
            :   node.type == "ColorRGBA" ? [reader.int8U(), reader.int8U(), reader.int8U(), reader.int8U()]
            :   reader.read(node.size)
            reader.jump(pos + node.size)
            r = new ObjectValue(node.name, node.type, reader.endian, value)
        }
        if (r.type === "string") {
            const decoder = new TextDecoder()
            r.value = decoder.decode(new Uint8Array(r.value.map((c: any) => c.value)))
        }
        if ((node.flags & 0x4000) != 0) reader.align(4)
        return r
    }

    static parseTypeTree(assetClass: AssetClass) {
        if (assetClass.typeTree == null) return undefined
        const nodes = assetClass.typeTree.nodes
        var tree: TypeTreeStack | undefined
        var stack: TypeTreeStack[] = []
        nodes.forEach(node => {
            const self = {
                name: node.name,
                node: node,
                children: []
            }
            if (node.depth == 0) {
                tree = self
            } else {
                stack[node.depth - 1].children.push(self)
            }
            stack[node.depth] = self
        })
        return tree
    }
}

export interface TypeTreeStack {
    name: string
    node: Node
    children: TypeTreeStack[]
}

export interface AssetClass {
    classId: number
    stripped: number | null
    scriptId: number | null
    hash: string | null
    typeTree: TypeTree
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
    data: Uint8Array
}

export interface AssetReference {
    path: string | null
    guid: Uint8Array | null
    type: number | null
    filePath: string
}