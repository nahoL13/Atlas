import type { Tool, ToolResult } from '@atlas/contracts';

type Token =
  | { readonly type: 'num'; readonly value: number }
  | { readonly type: 'op'; readonly value: '+' | '-' | '*' | '/' }
  | { readonly type: 'lparen' }
  | { readonly type: 'rparen' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (ch === ' ' || ch === '\t') {
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen' });
      i += 1;
      continue;
    }
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ type: 'op', value: ch });
      i += 1;
      continue;
    }
    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let num = '';
      while (i < input.length && ((input[i]! >= '0' && input[i]! <= '9') || input[i]! === '.')) {
        num += input[i]!;
        i += 1;
      }
      const value = Number(num);
      if (Number.isNaN(value)) {
        throw new Error(`número inválido: ${num}`);
      }
      tokens.push({ type: 'num', value });
      continue;
    }
    throw new Error(`caractere inesperado: ${ch}`);
  }
  return tokens;
}

// Descida recursiva: expr := term (('+' | '-') term)*; term := factor (('*' | '/') factor)*;
// factor := ('+' | '-') factor | num | '(' expr ')'.
function evaluate(input: string): number {
  const tokens = tokenize(input);
  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];

  function parseFactor(): number {
    const t = peek();
    if (t === undefined) {
      throw new Error('expressão incompleta');
    }
    if (t.type === 'op' && (t.value === '+' || t.value === '-')) {
      pos += 1;
      const operand = parseFactor();
      return t.value === '-' ? -operand : operand;
    }
    if (t.type === 'num') {
      pos += 1;
      return t.value;
    }
    if (t.type === 'lparen') {
      pos += 1;
      const value = parseExpr();
      const close = peek();
      if (close === undefined || close.type !== 'rparen') {
        throw new Error('parêntese não fechado');
      }
      pos += 1;
      return value;
    }
    throw new Error('token inesperado');
  }

  function parseTerm(): number {
    let value = parseFactor();
    for (;;) {
      const t = peek();
      if (t !== undefined && t.type === 'op' && (t.value === '*' || t.value === '/')) {
        pos += 1;
        const rhs = parseFactor();
        if (t.value === '/') {
          if (rhs === 0) {
            throw new Error('divisão por zero');
          }
          value = value / rhs;
        } else {
          value = value * rhs;
        }
      } else {
        break;
      }
    }
    return value;
  }

  function parseExpr(): number {
    let value = parseTerm();
    for (;;) {
      const t = peek();
      if (t !== undefined && t.type === 'op' && (t.value === '+' || t.value === '-')) {
        pos += 1;
        const rhs = parseTerm();
        value = t.value === '+' ? value + rhs : value - rhs;
      } else {
        break;
      }
    }
    return value;
  }

  const result = parseExpr();
  if (pos !== tokens.length) {
    throw new Error('expressão malformada');
  }
  if (!Number.isFinite(result)) {
    throw new Error('resultado não finito');
  }
  return result;
}

export function createCalcTool(): Tool {
  return {
    name: 'calc',
    description:
      'Avalia uma expressão aritmética (+, -, *, /, parênteses, números decimais). Argumento: { "expression": "<expr>" }.',
    async run(args: Record<string, unknown>): Promise<ToolResult> {
      const expression = args['expression'];
      if (typeof expression !== 'string' || expression.trim() === '') {
        return { ok: false, error: 'calc requer um argumento "expression" (string não vazia)' };
      }
      try {
        return { ok: true, output: String(evaluate(expression)) };
      } catch (cause) {
        return { ok: false, error: `expressão inválida: ${(cause as Error).message}` };
      }
    },
  };
}
