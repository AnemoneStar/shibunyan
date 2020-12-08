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