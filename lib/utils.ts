export function times<T>(number: number, callback: (i: number) => T): T[] {
    var res: T[] = []
    for (let i = 0; i < number; i++) {
        res.push(callback(i))
    }
    return res
}