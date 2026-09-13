import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
const source = new URL('../node_modules/stockfish/', import.meta.url)
const target = new URL('../public/engine/', import.meta.url)
mkdirSync(target, { recursive: true })
for (const file of ['stockfish-18-lite-single.js', 'stockfish-18-lite-single.wasm'])
  copyFileSync(new URL(`bin/${file}`, source), new URL(file, target))
copyFileSync(new URL('Copying.txt', source), new URL('COPYING.txt', target))
writeFileSync(new URL('SOURCE.txt', target), 'Stockfish.js 18.0.8, Stockfish 18 lite single-threaded WebAssembly.\nCopyright Stockfish authors and Chess.com, LLC. Licensed under GPL-3.0.\nUnmodified engine from https://www.npmjs.com/package/stockfish/v/18.0.8\nSource and build instructions: https://github.com/nmrugg/stockfish.js/tree/93c994592dcf3b4b21052ab925e9b534df9c0918\nLicense: COPYING.txt\n')
