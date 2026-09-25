import { Fragment, type ReactNode } from "react";

type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "quote"; text: string }
  | { kind: "rule" };

const SAFE_LINK = /^https?:\/\/[^\s<>"]+$/i;

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  const isBoundary = (line: string) =>
    /^(#{1,4})\s/.test(line) || /^```/.test(line) || /^\s*([-*+]|\d+\.)\s+/.test(line) || /^>\s?/.test(line) || /^(-{3,}|\*{3,})\s*$/.test(line);

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```\s*([\w+-]*)\s*$/);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: "code", language: fence[1], text: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3 | 4, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", text: quote.join(" ") });
      continue;
    }

    const list = line.match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
    if (list) {
      const ordered = /\d+\./.test(list[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+\.)\s+(.*)$/);
        if (!item || /\d+\./.test(item[1]) !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && (paragraph.length === 0 || !isBoundary(lines[index]))) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`\n]+`)|(\*\*[^*\n]+\*\*)|(\[[^\]\n]+\]\([^)\s]+\))|(\*[^*\n]+\*)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let position = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${position++}`;
    if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("**")) nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link && SAFE_LINK.test(link[2])) {
        nodes.push(<a key={key} href={link[2]} target="_blank" rel="noopener noreferrer">{link[1]}</a>);
      } else nodes.push(token);
    } else nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Markdown({ source, className = "" }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={`markdown ${className}`.trim()}>
      {blocks.map((block, index) => {
        const key = `b${index}`;
        switch (block.kind) {
          case "heading": {
            const Tag = `h${Math.min(block.level + 1, 5)}` as "h2" | "h3" | "h4" | "h5";
            return <Tag key={key}>{renderInline(block.text, key)}</Tag>;
          }
          case "paragraph":
            return <p key={key}>{renderInline(block.text, key)}</p>;
          case "list": {
            const List = block.ordered ? "ol" : "ul";
            return (
              <List key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={`${key}-${itemIndex}`}>{renderInline(item, `${key}-${itemIndex}`)}</li>
                ))}
              </List>
            );
          }
          case "code":
            return (
              <pre key={key} tabIndex={0} aria-label={block.language ? `Código ${block.language}` : "Bloco de código"}>
                <code>{block.text}</code>
              </pre>
            );
          case "quote":
            return <blockquote key={key}>{renderInline(block.text, key)}</blockquote>;
          case "rule":
            return <hr key={key} />;
          default:
            return <Fragment key={key} />;
        }
      })}
    </div>
  );
}
