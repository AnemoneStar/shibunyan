const shibunyan = require("./dist/index.js")
const fs = require("fs")

const assetBundle = new shibunyan.AssetBundle(fs.readFileSync(process.argv[2]))
assetBundle.assets.forEach(asset => {
    var cnt = 0
    asset.objects.filter(obj => asset.objectType(obj) == "Texture2D").forEach(obj => {
        const image = new shibunyan.ImageDecoder(asset.parseObject(obj))
        fs.writeFileSync("out."+cnt+".bmp", image.bmp)
        console.log("out."+cnt+".bmp")
        cnt++
    })
})