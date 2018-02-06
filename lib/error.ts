export class ErrorBase extends Error {
    constructor(message: string) {
        super();
        Object.defineProperties(this, {
            name: {
                get() {
                    return (this.constructor as any).name
                }
            },
            message: {
                get() {
                    return message
                }
            }
        })
        Error.captureStackTrace(this, this.constructor)
    }
}

export class UnknownAssetBundleSignatureError extends ErrorBase {}
export class TypeTreeDefaultIsNotImplemented extends ErrorBase {}
export class NotImplementedError extends ErrorBase {}