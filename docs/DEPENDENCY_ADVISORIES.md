# Dependency advisories reviewed with Part 96

## xlsx (SheetJS) — high, no npm fix

`xlsx` stays a dependency because Log export writes workbooks with `XLSX.writeFile` in `lib/logExport.js`.

Uploaded spreadsheets are not parsed with `XLSX.read`. `lib/extractAttachment.js` reads `.xlsx` with `exceljs`, reads `.csv` as text, and rejects legacy `.xls`. Uploads are capped at 8 MB, 2,000 rows, and 20,000 cells.

## mammoth — moderate

`mammoth` extracts text from uploaded `.docx` files in `lib/extractAttachment.js`. The advisory reviewed with this change is the one `npm audit` reports through `mammoth` / `argparse` / `sprintf-js`. There is no patched release that keeps the current extractor. Uploads are size-capped, and the extracted text is truncated before it is sent to the model. Revisit when mammoth publishes a fix.

## brace-expansion — high

`npm audit fix` is the update for this transitive dependency. It is not application code.
