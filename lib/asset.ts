import BinaryReader, { Endian } from "./binary_reader";
import TypeTree, { Node } from "./type_tree";
import { NotImplementedError, TypeTreeDefaultIsNotImplemented } from "./error";
import class_id from "./constants/class_id";
import ObjectValue from "./object_value";

export default class Asset {
    format: number
    generatorVersion: string
    targetPlatform: number
    endian: Endian = Endian.Big
    assetClasses: AssetClass[]
    objects: AssetObjectData[]
    addIds: (number | bigint)[][] = []
    references: AssetReference[] = []

    constructor(data: Buffer, public name: string) {
        const reader = new BinaryReader(data)
        const metadataSize = reader.int32U()
        const size = reader.int32U()
        this.format = reader.int32U()
        const dataOffset = reader.int32U()
        if (this.format >= 9 && reader.int32S() == 0) {
            this.endian = Endian.Little
            reader.endian = this.endian
        }
        this.generatorVersion = reader.string()
        this.targetPlatform = reader.int32S()
        this.assetClasses = []
        if (this.format >= 17) {
            const hasTypeTrees = (reader.int8S() != 0)
            const typeTreeCount = reader.int32U()
            for (let i = 0; i<typeTreeCount; i++) {
                console.log(typeTreeCount)
                const classId = reader.int32S()
                reader.skip(1)
                const scriptId = reader.int16S()
                const hash = (classId < 0 || classId == 114) ? reader.readString(32) : reader.readString(16)
                const typeTree = hasTypeTrees ? new TypeTree(reader) : (() => {throw new TypeTreeDefaultIsNotImplemented("")})()
                this.assetClasses.push({
                    classId,
                    scriptId,
                    hash,
                    typeTree,
                })
            }
        } else if (this.format >= 13) {
            const hasTypeTrees = reader.int8S() != 0
            const typeTreeCount = reader.int32U()
            for (let i = 0; i<typeTreeCount; i++) {
                const classId = reader.int32S()
                const hash = classId < 0 ? reader.readString(32) : reader.readString(16)
                const typeTree = hasTypeTrees ? new TypeTree(reader) : (() => {throw new TypeTreeDefaultIsNotImplemented("")})()
                this.assetClasses.push({
                    classId,
                    scriptId: null,
                    hash,
                    typeTree
                })
            }
        } else {
            throw new NotImplementedError("asset.format == "+this.format)
        }
        const longObjectIds = (this.format >= 14 || (7 <= this.format && this.format <= 13 && reader.int32S() != 0))
        this.objects = []
        const objectCount = reader.int32U()
        for (let i = 0; i<objectCount; i++) {
            if (this.format >= 14) reader.align(4)
            const pathId = longObjectIds ? reader.int64S() : reader.int32S()
            // if (Math.abs(pathId) > 2**53) throw new NotImplementedError("pathId > 2**53 ("+pathId+")")
            const offset = reader.int32U()
            const size = reader.int32U()

            const now_pos = reader.position
            reader.jump(dataOffset + offset)
            const data = reader.read(size)
            reader.position = now_pos

            const object: AssetObjectData = this.format >= 17
                ? {pathId, offset, size, typeId: null, classId: null, classIndex: reader.int32U(), destroyed: this.format <= 10 && reader.int16S() != 0, data}
                : {pathId, offset, size, typeId: reader.int32S(), classId: reader.int16S(), classIndex: null, destroyed: this.format <= 10 && reader.int16S() != 0, data}
            this.objects.push(object)
            if (11 <= this.format && this.format <= 16) reader.skip(2)
            if (15 <= this.format && this.format <= 16) reader.skip(1)
        }

        if (this.format >= 11) {
            const count = reader.int32U()
            for (let i = 0; i<count; i++) {
                if (this.format >= 14) reader.align(4)
                this.addIds.push([longObjectIds ? reader.int64S() : reader.int32S(), reader.int32S()])
            }
        }

        if (this.format >= 6) {
            this.references = []
            const count = reader.int32U()
            for (let i = 0; i<count; i++) {
                this.references.push({
                    path: reader.string(),
                    guid: reader.read(16),
                    type: reader.int32S(),
                    filePath: reader.string(),
                })
            }
        }
    }

    findAssetClass(obj: AssetObjectData) {
        return obj.classIndex
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
    scriptId: number | null
    hash: string
    typeTree: TypeTree
}

export interface AssetObjectData {
    pathId: number | bigint
    offset: number
    size: number
    typeId: number | null
    classId: number | null
    classIndex: number | null
    destroyed: boolean
    data: Buffer
}

export interface AssetReference {
    path: string
    guid: Buffer
    type: number
    filePath: string
}