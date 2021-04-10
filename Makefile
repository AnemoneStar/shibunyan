CFLAGS += -O3 -target wasm32-wasm -fno-builtin

all: dist/decoders/wasm/etc2.js
clean:
	rm dist/decoders/wasm/*.js tmp/decoders/wasm/*.{wasm,o}

dist/decoders/wasm/etc2.js: tmp/decoders/wasm/etc2.wasm
	node dist/internal/wasm_converter.js $< $@
tmp/decoders/wasm/etc2.wasm: tmp/decoders/wasm/etc2.o
	wasm-ld --no-entry --export-all -o $@ $<
tmp/decoders/wasm/etc2.o: lib/decoders/wasm/etc2.c
	@mkdir -p $(@D)
	clang $(CFLAGS) -c $< -o $@
