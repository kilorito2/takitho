// C0/C1 control characters, zero-width and bidi marks, line/paragraph separators, BOM.
// Built from a string so the source file never contains the raw (invisible) characters.
const INVISIBLE = new RegExp('[\\u0000-\\u001f\\u007f-\\u009f\\u200b-\\u200f\\u2028\\u2029\\ufeff]', 'g')

/**
 * Customer free text (notes, references): the UI renders it as text and the kitchen prints it, so we
 * strip control characters and angle brackets, collapse whitespace and cap the length.
 */
export function sanitizeText(input: string, maxLength = 140): string {
  return input
    .replace(INVISIBLE, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}
