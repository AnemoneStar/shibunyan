# shibunyan

[mikunyan](https://github.com/Ishotihadus/mikunyan) in TypeScript

## supported environments

- Node.js
- Web Browser that supports BigInt https://caniuse.com/bigint
  - NOTE: in browser, `ImageDecoder#bmp()` unavaiable because it depends to Node.js Buffer. Instead, you should use HTML5 Canvas and [`ImageData`](https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData) (or polyfill).

## optional requirements

- If you want to decode ETC2 texture, you need WebAssembly https://caniuse.com/wasm support in your JavaScript runtime.
  - If you are on PowerPC(64) or other big-endian platforms, WebAssembly may not be supported in your JavaScript runtime.

## supported features

- UnityFS and UnityRaw

### supported image format

- rgba24
- rgba4444
- rgba32 (8888)
- rgb565
- etc1
- etc2(rgba8)

other image formats will be supported later(please do not expect).

## Acknowledgements

- [mikunyan](https://github.com/Ishotihadus/mikunyan), MIT License

## License

MIT License.