import pluginCommonJS from "@rollup/plugin-commonjs"
import pluginNodeResolve from "@rollup/plugin-node-resolve"
import { terser } from "rollup-plugin-terser"

export default [{
    input: "./dist/index.js",
    output: [{
        name: "shibunyan",
        file: __dirname+"/dist/shibunyan.umd.min.js",
        format: "umd",
    }],
    plugins: [
        pluginCommonJS(),
        pluginNodeResolve(),
        terser({
            mangle: false,
            output: {
                comments(node, comment) {
                    return /license|copyright/i.test(comment.value)
                },
                keep_numbers: true,
            },
            keep_classnames: true,
            keep_fnames: true,
            ecma: 2015,
        }),
    ]
}]