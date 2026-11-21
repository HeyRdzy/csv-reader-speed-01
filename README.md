[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/HeyRdzy/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/HeyRdzy/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed-01

A faster drop-in for [make.fun's csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121): read broken CSV files faster while answering exactly as csv-reader 1.0.0 does on every case.

`solve.js` is a dependency-free ES module whose `run(input)` returns csv-reader's reading of `{text, header}` as `{columns, rows, errors}`, following its broken-row policy exactly (BOM, stray CRs, quoted fields with doubled quotes and embedded line breaks, quote junk, unterminated quotes, short/long rows). `main.ts` is the harness driver: it reads every case from `/input/cases.json`, answers each with `run`, and writes `/output/answers.json`.

## How it is faster

The reference reads one character at a time and builds every field up a character at a time. This entry cuts each field out with `indexOf`/`slice` instead: an unquoted field is the slice up to the nearest comma or line break (a stray CR inside it is dropped in a second pass over that short slice only), and a quoted field is scanned for its closing quote, with `""` escapes and embedded line breaks handled on the joined content. No per-character loop runs on the common path.
