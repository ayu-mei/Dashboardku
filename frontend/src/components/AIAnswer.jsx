// Render the supported AI formatting as React elements, never as raw HTML.
function inline(text) {
  return text.split(/(\*\*[^*\n]+\*\*)/g).map((part, index) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={index} className="font-semibold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

function cells(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split(/(?<!\\)\|/)
    .map((cell) => cell.trim().replace(/\\\|/g, "|"));
}

export default function AIAnswer({ children, className = "" }) {
  const lines = String(children || "").split("\n");
  const blocks = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const headers = cells(line);
    const separators = cells(lines[i + 1] || "");
    if (
      line.includes("|") &&
      headers.length > 1 &&
      headers.length === separators.length &&
      separators.every((cell) => /^:?-{3,}:?$/.test(cell))
    ) {
      const rows = [];
      const align = separators.map((cell) =>
        cell.endsWith(":")
          ? cell.startsWith(":")
            ? "center"
            : "right"
          : "left",
      );
      i += 2;
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const row = cells(lines[i]);
        if (row.length !== headers.length) break;
        rows.push(row);
        i++;
      }
      blocks.push(
        <div
          key={`table-${i}`}
          className="ai-table-scroll"
          role="region"
          aria-label="Tabel jawaban Yuwi"
          tabIndex={0}
        >
          <table className="ai-answer-table">
            <thead>
              <tr>
                {headers.map((cell, index) => (
                  <th
                    key={index}
                    scope="col"
                    style={{ textAlign: align[index] }}
                  >
                    {inline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, column) => (
                    <td key={column} style={{ textAlign: align[column] }}>
                      {inline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }
    const numbered = /^\s*\d+[.)]\s+/;
    const bullet = /^\s*[-*]\s+/;
    const pattern = numbered.test(line)
      ? numbered
      : bullet.test(line)
        ? bullet
        : null;
    if (pattern) {
      const items = [];
      const start = Number(line.match(/^\s*(\d+)/)?.[1] || 1);
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(<li key={i}>{inline(lines[i++].replace(pattern, ""))}</li>);
      }
      const Tag = pattern === numbered ? "ol" : "ul";
      blocks.push(
        <Tag
          key={i}
          start={Tag === "ol" ? start : undefined}
          className={`pl-5 ${Tag === "ol" ? "list-decimal" : "list-disc"} space-y-1`}
        >
          {items}
        </Tag>,
      );
    } else {
      blocks.push(
        <p key={i} className="whitespace-pre-wrap">
          {inline(lines[i++])}
        </p>,
      );
    }
  }
  return (
    <div
      className={`space-y-2 break-words text-sm leading-7 text-slate-700 ${className}`}
    >
      {blocks}
    </div>
  );
}
