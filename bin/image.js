#!/usr/bin/env node
const shibunyan = require("../")
const fs = require("fs")

const assetBundle = new shibunyan.AssetBundle(fs.readFileSync(process.argv[2]))
for (const asset of assetBundle.assets) {
    var cnt = 0
    for (const obj of asset.objects) {
        if (asset.objectType(obj) !== "Texture2D") continue
        const image = new shibunyan.ImageDecoder(asset.parseObject(obj))
        fs.writeFileSync("out."+cnt+".bmp", image.bmp)
        console.log("out."+cnt+".bmp")
        cnt++
    }
}