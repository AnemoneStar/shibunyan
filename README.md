# shibunyan

[mikunyan](https://github.com/Ishotihadus/mikunyan) in TypeScript

## supported environments

- Node.js
- Web Browser that supports BigInt https://caniuse.com/bigint
  - NOTE: in browser, `ImageDecoder#bmp()` unavaiable because it depends to Node.js Buffer. Instead, you should use HTML5 Canvas and [`ImageData`](https://developer.mozilla.org/en-US/docs/Web/API/ImageData/ImageData) (or polyfill).

## supported features

- UnityFS and UnityRaw

### supported image format

- rgba24
- rgba4444
- rgba32 (8888)
- rgb565
- etc1

other image formats will be supported later(please do not expect).