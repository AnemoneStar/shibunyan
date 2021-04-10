export function times<T>(number: number, callback: (i: number) => T): T[] {
    var res: T[] = []
    for (let i = 0; i < number; i++) {
        res.push(callback(i))
    }
    return res
}

export function safeBigIntToNumber(bigint: bigint | number): number {
    if (bigint > Number.MAX_SAFE_INTEGER) throw new Error(`Trying to Convert ${bigint} to integer number, but Overflow!`)
    if (bigint < Number.MIN_SAFE_INTEGER) throw new Error(`Trying to Convert ${bigint} to integer number, but Underflow!`)
    return Number(bigint)
}

let base64Decoder = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0))

try {
    base64Decoder("")
} catch(e) {
    base64Decoder = b64 => Buffer.from(b64, "base64")
}

export function wasmB64(b64: string) {
    return {
        module() {
            console.log(b64)
            const src = base64Decoder(b64)
            console.log(src)
            const mod = new WebAssembly.Module(src)
            this.module = function() {
                return mod
            }
            return mod
        },
        instance() {
            return new WebAssembly.Instance(this.module())
        }
    }
}

export type WASMModule<Exports = {}> = { instance: () => WebAssembly.Instance & { exports: Exports } }
export const WASM_PAGE_SIZE = 64 * 1024