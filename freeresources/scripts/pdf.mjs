/**
 * Minimal PDF writer used to generate the clearly-labelled sample files that
 * ship with the seed data. Produces a real, valid PDF (preview + download work).
 */

function escapeText(value) {
  return value
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(text, width = 88) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > width) {
      if (line) lines.push(line.trim());
      line = word;
    } else {
      line = `${line} ${word}`;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

export function buildPdf({ title, subtitle, paragraphs, footer }) {
  const lines = [];

  for (const paragraph of paragraphs) {
    for (const line of wrap(paragraph)) lines.push(line);
    lines.push("");
  }

  const content = [
    "0.06 0.23 0.18 rg",
    "BT /F1 9 Tf 56 806 Td (FreeResources.in) Tj ET",
    "0.78 0.51 0.18 rg",
    "56 798 m 539 798 l 1.2 w S",
    "0.08 0.12 0.10 rg",
    "BT /F1 22 Tf 56 756 Td (" + escapeText(title) + ") Tj ET",
  ];

  if (subtitle) {
    content.push("0.35 0.40 0.37 rg", "BT /F2 11 Tf 56 734 Td (" + escapeText(subtitle) + ") Tj ET");
  }

  content.push("0.08 0.12 0.10 rg", "BT /F2 11 Tf 15 TL 56 700 Td");
  for (const line of lines.slice(0, 42)) {
    content.push(`(${escapeText(line)}) Tj T*`);
  }
  content.push("ET");

  content.push(
    "0.06 0.23 0.18 rg",
    "BT /F1 9 Tf 56 60 Td (" + escapeText(footer || "Freely shared for students. Report issues at freeresources.in/support") + ") Tj ET",
  );

  const stream = content.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];

  let output = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((obj, index) => {
    offsets.push(Buffer.byteLength(output, "latin1"));
    output += `${index + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(output, "latin1");
}
