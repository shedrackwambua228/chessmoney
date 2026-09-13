const assert = require('node:assert/strict');
const { Chess } = require('chess.js');
const puzzles = require('../src/puzzles.json');
(async () => {
 const e = await require('stockfish')('lite-single');
 for (const puzzle of puzzles) {
  const board = new Chess(puzzle.fen);
  for (const [step, uci] of puzzle.line.entries()) {
   board.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]});
   if (step % 2 === 0 && step + 1 < puzzle.line.length)
    assert.deepEqual(board.moves({verbose:true}).map(m => m.from+m.to+(m.promotion || '')), [puzzle.line[step+1]], puzzle.id+' must force its reply');
  }
  assert.ok(board.isCheckmate(), puzzle.id);
  await new Promise((resolve, reject) => {
   let info='';
   e.listener = line => { if (line.includes(' pv ')) info=line; if (line.startsWith('bestmove')) { console.log(puzzle.id+'\n'+info); const mate = info.match(/score mate (\d+)/); if (!mate || Number(mate[1]) !== Math.ceil(puzzle.line.length/2)) reject(new Error('Unexpected mate distance')); else resolve(); } };
   e.sendCommand('position fen '+puzzle.fen); e.sendCommand('go depth 24 searchmoves '+puzzle.line[0]);
  });
 }
 e.sendCommand('quit');
})().catch(error => { console.error(error); process.exit(1); });
