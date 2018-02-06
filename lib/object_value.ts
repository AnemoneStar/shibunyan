import { Endian } from "./binary_reader";

export default class ObjectValue{
    name: string
    type: string
    value: any
    endian: Endian
    isStruct: boolean
    [key: string]: any

    constructor(name: string, type: string, endian: Endian, value: any = undefined) {
        this.name = name
        this.type = type
        this.endian = endian
        this.value = value
        this.isStruct = false
    }
}