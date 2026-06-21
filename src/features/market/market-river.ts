export type MarketRiverRelationship = "aligned" | "diverged" | "mixed" | "unknown";

export type MarketRiverNode = {
  title: string;
  newsTheme: string;
  targets: string;
  marketFeedback: string;
  connection: string;
  gap: string;
  relationship: MarketRiverRelationship;
};

export type MarketRiver = {
  marketRead: string;
  nodes: MarketRiverNode[];
};

const sectionBody = (content: string, heading: RegExp) => {
  const match = content.match(heading);
  if (!match?.index) return "";
  const start = match.index + match[0].length;
  const remainder = content.slice(start);
  const nextSection = remainder.search(/\n##\s+/);
  return (nextSection === -1 ? remainder : remainder.slice(0, nextSection)).trim();
};

const bulletValue = (line: string) =>
  line
    .replace(/^\s*-\s*/, "")
    .replace(/^\*\*[^*]+\*\*\s*[:\uFF1A]?\s*/, "")
    .trim();

const hasAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term));

const inferRelationship = (connection: string): MarketRiverRelationship => {
  const normalized = connection.toLowerCase();
  const unknown = /not clearly confirmed|unable|unknown/.test(normalized) ||
    hasAny(connection, ["\u65E0\u6CD5", "\u672A\u89C2\u5BDF", "\u7F3A\u5C11", "\u4E0D\u660E\u786E", "\u5C1A\u672A\u786E\u8BA4"]);
  const diverged = /diverg/.test(normalized) ||
    hasAny(connection, ["\u80CC\u79BB", "\u65B9\u5411\u4E0D\u4E00\u81F4", "\u9006\u52BF", "\u76F8\u53CD"]);
  const aligned = /align|consistent/.test(normalized) ||
    hasAny(connection, ["\u4E00\u81F4", "\u547C\u5E94", "\u786E\u8BA4", "\u540C\u6B65"]);

  if ((unknown || diverged) && aligned) return "mixed";
  if (unknown) return "unknown";
  if (diverged) return "diverged";
  if (aligned) return "aligned";
  return "mixed";
};

export function parseMarketRiver(content: string): MarketRiver {
  const marketRead = sectionBody(content, /##\s+\d+\.\s+Market Read[^\n]*\n?/i)
    .replace(/\n+/g, " ")
    .trim();
  const map = sectionBody(content, /##\s+\d+\.\s+News-to-Stock Map[^\n]*\n?/i);
  if (!map) return { marketRead, nodes: [] };

  const nodes = map
    .split(/^###\s+/gm)
    .slice(1)
    .map((block) => {
      const [title = "", ...body] = block.split("\n");
      const values = body
        .join("\n")
        .replace(/(?<!^)\s+-\s+\*\*/g, "\n- **")
        .split("\n")
        .filter((line) => /^\s*-\s+/.test(line))
        .map(bulletValue);
      const [newsTheme = "", targets = "", marketFeedback = "", connection = "", gap = ""] = values;
      return {
        title: title.trim(),
        newsTheme,
        targets,
        marketFeedback,
        connection,
        gap,
        relationship: inferRelationship(connection),
      };
    })
    .filter((node) => node.title && (node.newsTheme || node.marketFeedback || node.connection));

  return { marketRead, nodes };
}
