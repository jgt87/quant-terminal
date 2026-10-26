// Tiny JavaScript tokenizer for the script editor's highlight overlay (no dependencies).

export type TokenType = "kw" | "str" | "num" | "com" | "fn" | "api" | "plain";
export interface Token {
  type: TokenType;
  text: string;
}

const KEYWORDS = new Set(
  "break case catch class const continue default delete do else false finally for function if in instanceof let new null of return switch this throw true try typeof undefined var void while".split(" "),
);
export const API_NAMES = new Set(["bars", "open", "high", "low", "close", "volume", "ta", "plot", "log", "signal", "Math", "Number", "Array"]);

const RE = /(\/\/[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|("(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?|`(?:\\.|[^`\\])*`?)|(\b\d[\d_]*(?:\.\d+)?(?:e[+-]?\d+)?\b|\.\d+\b)|([A-Za-z_$][\w$]*)/g;

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  const push = (type: TokenType, text: string) => {
    if (!text) return;
    const prev = out[out.length - 1];
    if (prev && prev.type === type && type === "plain") prev.text += text;
    else out.push({ type, text });
  };
  for (const m of src.matchAll(RE)) {
    const i = m.index ?? 0;
    push("plain", src.slice(last, i));
    const [text, com, str, num, ident] = m;
    if (com) push("com", text);
    else if (str) push("str", text);
    else if (num) push("num", text);
    else if (ident) {
      if (KEYWORDS.has(ident)) push("kw", text);
      else if (API_NAMES.has(ident)) push("api", text);
      else if (/^\s*\(/.test(src.slice(i + text.length, i + text.length + 4))) push("fn", text);
      else push("plain", text);
    }
    last = i + text.length;
  }
  push("plain", src.slice(last));
  return out;
}
