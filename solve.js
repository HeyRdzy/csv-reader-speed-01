// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answers on every input, faster: a field is cut out with indexOf/slice
// instead of one character at a time, and a quoted field is scanned for its
// closing quote instead of walked character by character.
//
// Semantics (csv-reader 1.0.0, MIT, derived from d3-dsv 3.0.2 and papaparse 5.7.1):
// - A U+FEFF at the very start is dropped; a record ends at LF or CRLF; an empty line is no record.
// - Outside quotes a CR not followed by LF is dropped (stray_cr).
// - A quoted field runs to the next quote that is not doubled; "" inside it is one quote, and each
//   CRLF or lone CR inside it is read as LF; what follows its closing quote, up to the next comma or
//   line break, is appended as it stands (quote_junk, when the field ends); a quote that never closes
//   is a literal character, and the text after it is read again as unquoted (unterminated_quote).
// - A quote inside an unquoted field is a literal character. Fields stay strings, never trimmed
//   or converted.
// - columns is the first record when header is true, else null; rows holds the records after it
//   (every record when header is false), each padded with "" (short_row, with fields: its field
//   count) or cut (long_row, with extra: the cut fields) to the first record's width.
// - Each error is {code, line, row}, in the order met, a record's short_row or long_row when it
//   ends: line the 1-based line its record starts on, row its record's index in rows, null for
//   the header.

// How a field ended: at a comma (the record goes on), at a line break or at the end of the text.
const COMMA = 0;
const BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xFEFF) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The field just read: its value and how it ended.
  let fVal = '';
  let fEnd = END;

  function err(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads an unquoted field from pos, starting from `init` ("" for a fresh field, the quoted
  // value for what follows a closing quote). A CR not followed by LF is dropped (stray_cr).
  // Returns the characters kept; sets fVal and fEnd.
  function unquoted(init) {
    const c = text.indexOf(',', pos);
    const l = text.indexOf('\n', pos);
    let end;
    let isComma;
    if (c === -1 && l === -1) {
      end = n;
      isComma = false;
    } else if (l === -1 || (c !== -1 && c < l)) {
      end = c;
      isComma = true;
    } else {
      end = l;
      isComma = false;
    }
    // A CR just before the line break is the CRLF's, not part of the field.
    let contentEnd = end;
    if (!isComma && end < n && end > pos && text.charCodeAt(end - 1) === 13) contentEnd = end - 1;
    const content = text.slice(pos, contentEnd);
    let added;
    const r = content.indexOf('\r');
    if (r === -1) {
      fVal = init === '' ? content : init + content;
      added = content.length;
    } else {
      // The field holds stray CRs: drop each (one stray_cr error each) and keep the rest.
      let v = init;
      let from = 0;
      let crs = 0;
      let k = r;
      while (k !== -1) {
        v += content.slice(from, k);
        crs += 1;
        err('stray_cr');
        from = k + 1;
        k = content.indexOf('\r', from);
      }
      v += content.slice(from);
      fVal = v;
      added = content.length - crs;
    }
    if (isComma) {
      pos = end + 1;
      fEnd = COMMA;
    } else if (end < n) {
      pos = end + 1;
      line += 1;
      fEnd = BREAK;
    } else {
      pos = n;
      fEnd = END;
    }
    return added;
  }

  // Reads a quoted field whose opening quote is at pos. Sets fVal and fEnd.
  function quoted() {
    const open = pos;
    let k = pos + 1;
    let parts = null; // segments around doubled quotes, joined at the close
    let close = -1;
    for (;;) {
      const j = text.indexOf('"', k);
      if (j === -1) {
        // The quote never closes: it is a literal character, and the text after it is
        // read again as unquoted. line is still the opening line (nothing counted yet).
        pos = open + 1;
        err('unterminated_quote');
        unquoted('"');
        return;
      }
      if (text.charCodeAt(j + 1) === 34) {
        if (parts === null) parts = [text.slice(k, j)];
        else parts.push(text.slice(k, j));
        parts.push('"');
        k = j + 2;
        continue;
      }
      close = j;
      break;
    }
    let content;
    if (parts === null) content = text.slice(open + 1, close);
    else {
      parts.push(text.slice(k, close));
      content = parts.join('');
    }
    // Each CRLF or lone CR inside is read as LF; count the line breaks.
    if (content.indexOf('\n') !== -1 || content.indexOf('\r') !== -1) {
      content = content.replace(/\r\n?/g, '\n');
      line += content.split('\n').length - 1;
    }
    pos = close + 1;
    if (pos >= n) {
      fVal = content;
      fEnd = END;
      return;
    }
    const d = text.charCodeAt(pos);
    if (d === 44) {
      pos += 1;
      fVal = content;
      fEnd = COMMA;
      return;
    }
    if (d === 10) {
      pos += 1;
      line += 1;
      fVal = content;
      fEnd = BREAK;
      return;
    }
    if (d === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fVal = content;
      fEnd = BREAK;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next comma
    // or line break.
    const added = unquoted(content);
    if (added > 0) err('quote_junk');
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let lastQuoted = false;
    do {
      if (text.charCodeAt(pos) === 34) {
        lastQuoted = true;
        quoted();
      } else {
        lastQuoted = false;
        unquoted('');
      }
      fields.push(fVal);
    } while (fEnd === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
