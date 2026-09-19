"use node";

import fontkit from "@pdf-lib/fontkit";
import MarkdownIt, { type Token } from "markdown-it";
import {
  PDFDocument,
  PageSizes,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

const LAYOUT_VERSION = 1;
const FONT_URL =
  "https://android.googlesource.com/platform/external/noto-fonts/+\u002frefs\u002ftags\u002fandroid-12.1.0_r9/other/NotoSans-Regular.ttf?format=TEXT";
const PAGE_WIDTH = PageSizes.A4[0];
const PAGE_HEIGHT = PageSizes.A4[1];
const MARGIN_X = 54;
const TOP_MARGIN = 56;
const BOTTOM_MARGIN = 52;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; text: string; indent: number }
  | { kind: "code"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "rule" };

type FontBundle = {
  body: PDFFont;
  fallback: boolean;
};

function cleanText(value: string): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();
}

function inlineText(token: Token): string {
  if (!token.children) return cleanText(token.content);
  let output = "";
  let linkHref: string | undefined;
  for (const child of token.children) {
    if (child.type === "link_open") {
      const href = child.attrGet("href");
      linkHref = typeof href === "string" ? href : undefined;
      continue;
    }
    if (child.type === "link_close") {
      if (linkHref) output += ` (${linkHref})`;
      linkHref = undefined;
      continue;
    }
    if (child.type === "softbreak" || child.type === "hardbreak") {
      output += "\n";
      continue;
    }
    if (child.type === "image") {
      output += child.attrGet("alt") ?? child.content;
      continue;
    }
    output += child.content;
  }
  return cleanText(output);
}

function parseTable(tokens: Token[], start: number): { block: Block; end: number } {
  const rows: string[][] = [];
  let row: string[] | undefined;
  for (let index = start + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "table_close") {
      return { block: { kind: "table", rows }, end: index };
    }
    if (token.type === "tr_open") {
      row = [];
      continue;
    }
    if (token.type === "tr_close") {
      if (row && row.length > 0) rows.push(row);
      row = undefined;
      continue;
    }
    if ((token.type === "th_open" || token.type === "td_open") && row) {
      const inline = tokens[index + 1];
      if (inline?.type === "inline") {
        row.push(inlineText(inline));
        index += 1;
      }
    }
  }
  return { block: { kind: "table", rows }, end: tokens.length - 1 };
}

function parseBlocks(markdown: string): Block[] {
  const parser = new MarkdownIt({ html: false, linkify: false, typographer: false });
  const tokens = parser.parse(markdown, {});
  const blocks: Block[] = [];
  let listDepth = 0;
  let orderedList = false;
  let listNumber = 1;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type === "heading_open") {
      const inline = tokens[index + 1];
      if (inline?.type === "inline") {
        blocks.push({
          kind: "heading",
          level: Number(token.tag.slice(1)) || 2,
          text: inlineText(inline),
        });
        index += 2;
      }
      continue;
    }
    if (token.type === "paragraph_open") {
      const inline = tokens[index + 1];
      if (inline?.type === "inline") {
        const text = inlineText(inline);
        if (listDepth > 0) {
          const marker = orderedList ? `${listNumber}. ` : "• ";
          blocks.push({ kind: "list", text: marker + text, indent: listDepth });
          if (orderedList) listNumber += 1;
        } else {
          blocks.push({ kind: "paragraph", text });
        }
        index += 2;
      }
      continue;
    }
    if (token.type === "bullet_list_open") {
      listDepth += 1;
      orderedList = false;
      listNumber = 1;
      continue;
    }
    if (token.type === "ordered_list_open") {
      listDepth += 1;
      orderedList = true;
      listNumber = Number(token.attrGet("start") ?? "1") || 1;
      continue;
    }
    if (token.type === "bullet_list_close" || token.type === "ordered_list_close") {
      listDepth = Math.max(0, listDepth - 1);
      orderedList = false;
      listNumber = 1;
      continue;
    }
    if (token.type === "fence" || token.type === "code_block") {
      blocks.push({ kind: "code", text: cleanText(token.content) });
      continue;
    }
    if (token.type === "blockquote_open") {
      const inline = tokens[index + 2];
      if (inline?.type === "inline") {
        blocks.push({ kind: "quote", text: inlineText(inline) });
        index += 2;
      }
      continue;
    }
    if (token.type === "hr") {
      blocks.push({ kind: "rule" });
      continue;
    }
    if (token.type === "table_open") {
      const table = parseTable(tokens, index);
      blocks.push(table.block);
      index = table.end;
    }
  }
  return blocks.filter((block) => block.kind === "rule" || block.kind === "table" || block.text.length > 0);
}

function fallbackText(value: string): string {
  return Array.from(value)
    .map((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 255 ? character : "?";
    })
    .join("");
}

function wrapText(text: string, font: PDFFont, size: number, width: number, fallback: boolean): string[] {
  const prepared = fallback ? fallbackText(cleanText(text)) : cleanText(text);
  const lines: string[] = [];
  for (const paragraph of prepared.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const character of word) {
        const next = line + character;
        if (font.widthOfTextAtSize(next, size) > width && line) {
          lines.push(line);
          line = character;
        } else {
          line = next;
        }
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

async function loadFont(pdf: PDFDocument): Promise<FontBundle> {
  try {
    const response = await fetch(FONT_URL, { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("FONT_FETCH_FAILED");
    const encoded = await response.text();
    const bytes = Buffer.from(encoded.replace(/\s+/g, ""), "base64");
    if (bytes.length < 10_000 || bytes.length > 5_000_000) throw new Error("FONT_SIZE_INVALID");
    pdf.registerFontkit(fontkit);
    return { body: await pdf.embedFont(bytes, { subset: true }), fallback: false };
  } catch {
    return { body: await pdf.embedFont(StandardFonts.Helvetica), fallback: true };
  }
}

function addPage(pdf: PDFDocument): { page: PDFPage; y: number } {
  const page = pdf.addPage(PageSizes.A4);
  return { page, y: PAGE_HEIGHT - TOP_MARGIN };
}

function drawWrapped(
  page: PDFPage,
  text: string,
  fonts: FontBundle,
  size: number,
  lineHeight: number,
  x: number,
  y: number,
  width: number,
): number {
  let current = y;
  for (const line of wrapText(text, fonts.body, size, width, fonts.fallback)) {
    page.drawText(line, { x, y: current, size, font: fonts.body, color: rgb(0.12, 0.14, 0.18) });
    current -= lineHeight;
  }
  return current;
}

function drawTable(
  page: PDFPage,
  rows: string[][],
  fonts: FontBundle,
  x: number,
  y: number,
  width: number,
): number {
  if (rows.length === 0) return y;
  const columns = Math.max(...rows.map((row) => row.length));
  const columnWidth = width / Math.max(1, columns);
  let current = y;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    const rendered = row.map((cell) => wrapText(cell, fonts.body, 8.5, columnWidth - 12, fonts.fallback));
    const height = Math.max(18, ...rendered.map((lines) => lines.length * 12 + 8));
    page.drawRectangle({
      x,
      y: current - height + 3,
      width,
      height,
      color: rowIndex === 0 ? rgb(0.93, 0.95, 0.98) : rgb(1, 1, 1),
      borderColor: rgb(0.78, 0.81, 0.86),
      borderWidth: 0.5,
    });
    for (let column = 0; column < columns; column += 1) {
      const cellLines = rendered[column] ?? [""];
      for (let line = 0; line < cellLines.length; line += 1) {
        page.drawText(cellLines[line], {
          x: x + column * columnWidth + 6,
          y: current - 12 - line * 12,
          size: 8.5,
          font: fonts.body,
          color: rgb(0.12, 0.14, 0.18),
        });
      }
    }
    current -= height;
  }
  return current - 10;
}

export async function renderReportPdf(input: {
  title: string;
  summary: string;
  markdown: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonts = await loadFont(pdf);
  const blocks = parseBlocks(input.markdown);
  const pages: PDFPage[] = [];
  let state = addPage(pdf);
  pages.push(state.page);

  const newPage = () => {
    state = addPage(pdf);
    pages.push(state.page);
  };
  const ensure = (height: number) => {
    if (state.y - height < BOTTOM_MARGIN) newPage();
  };

  ensure(80);
  state.page.drawText(fallbackText(cleanText(input.title)), {
    x: MARGIN_X,
    y: state.y,
    size: 24,
    font: fonts.body,
    color: rgb(0.08, 0.1, 0.16),
  });
  state.y -= 34;
  state.y = drawWrapped(state.page, input.summary, fonts, 11, 16, MARGIN_X, state.y, CONTENT_WIDTH);
  state.y -= 18;

  for (const block of blocks) {
    if (block.kind === "heading") {
      const size = block.level <= 1 ? 18 : block.level === 2 ? 15 : 12;
      ensure(44);
      state.y -= 8;
      state.page.drawText(fallbackText(block.text), {
        x: MARGIN_X,
        y: state.y,
        size,
        font: fonts.body,
        color: rgb(0.08, 0.1, 0.16),
      });
      state.y -= size + 8;
      continue;
    }
    if (block.kind === "table") {
      ensure(40);
      state.y = drawTable(state.page, block.rows, fonts, MARGIN_X, state.y, CONTENT_WIDTH);
      continue;
    }
    if (block.kind === "rule") {
      ensure(20);
      state.page.drawLine({
        start: { x: MARGIN_X, y: state.y },
        end: { x: PAGE_WIDTH - MARGIN_X, y: state.y },
        thickness: 0.8,
        color: rgb(0.78, 0.81, 0.86),
      });
      state.y -= 16;
      continue;
    }
    const size = block.kind === "code" ? 8.5 : 10.5;
    const lineHeight = block.kind === "code" ? 12 : 15;
    const indent = block.kind === "list" ? Math.min(32, block.indent * 14) : block.kind === "quote" ? 16 : 0;
    const text = block.kind === "quote" ? `“${block.text}”` : block.text;
    const lines = wrapText(text, fonts.body, size, CONTENT_WIDTH - indent, fonts.fallback);
    const height = Math.max(lineHeight, lines.length * lineHeight) + (block.kind === "code" ? 14 : 4);
    ensure(height);
    if (block.kind === "code") {
      state.page.drawRectangle({
        x: MARGIN_X,
        y: state.y - height + 6,
        width: CONTENT_WIDTH,
        height,
        color: rgb(0.96, 0.97, 0.98),
        borderColor: rgb(0.86, 0.88, 0.91),
        borderWidth: 0.5,
      });
    }
    if (block.kind === "quote") {
      state.page.drawLine({
        start: { x: MARGIN_X + 3, y: state.y + 2 },
        end: { x: MARGIN_X + 3, y: state.y - height + 4 },
        thickness: 2,
        color: rgb(0.31, 0.36, 0.62),
      });
    }
    state.y = drawWrapped(
      state.page,
      text,
      fonts,
      size,
      lineHeight,
      MARGIN_X + indent + (block.kind === "code" ? 8 : 0),
      state.y - (block.kind === "code" ? 4 : 0),
      CONTENT_WIDTH - indent - (block.kind === "code" ? 16 : 0),
    );
    state.y -= block.kind === "code" ? 10 : 8;
  }

  pages.forEach((page, index) => {
    page.drawText(`${index + 1} / ${pages.length}`, {
      x: PAGE_WIDTH - MARGIN_X - 50,
      y: 24,
      size: 8,
      font: fonts.body,
      color: rgb(0.38, 0.41, 0.47),
    });
  });

  pdf.setTitle(cleanText(input.title));
  pdf.setSubject("Parallex research report");
  pdf.setProducer(`Parallex report renderer ${LAYOUT_VERSION}`);
  return await pdf.save({ useObjectStreams: true });
}

export { LAYOUT_VERSION };
