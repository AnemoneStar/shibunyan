import { WASMModule } from "../../utils"

declare const etc2Decoder: WASMModule<{
    memory: WebAssembly.Memory,
    decode_etc2a8(input: number, output: number, width: number, height: number): void,
}>

export = etc2Decoder