/* ============================================================
   engine/seta.js — arithmetic for SET /A (32-bit integers)
   ============================================================ */
const SetA = (() => {
  function lex(s) {
    const toks = [];
    let i = 0;
    const ops = ["<<=", ">>=", "*=", "/=", "%=", "+=", "-=", "&=", "^=", "|=", "<<", ">>", "(", ")", "!", "~", "*", "/", "%", "+", "-", "&", "^", "|", "=", ","];
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (/[0-9]/.test(c)) {
        const m = s.slice(i).match(/^(0x[0-9a-f]+|0[0-7]*|[1-9][0-9]*)/i);
        const bad = s.slice(i).match(/^[0-9][0-9a-z]*/i)[0];
        if (!m || m[0].length !== bad.length) throw new Error("Invalid number.  Numeric constants are either decimal (17),\nhexadecimal (0x11), or octal (021).");
        let v = m[0].toLowerCase().startsWith("0x") ? parseInt(m[0], 16) : m[0].length > 1 && m[0][0] === "0" ? parseInt(m[0], 8) : parseInt(m[0], 10);
        toks.push({ t: "num", v: v | 0 }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$#@.{}\[\]]/.test(c)) {
        const m = s.slice(i).match(/^[^\s()!~*\/%+\-<>&^|=,]+/);
        toks.push({ t: "id", v: m[0] }); i += m[0].length; continue;
      }
      const op = ops.find((o) => s.startsWith(o, i));
      if (!op) throw new Error("Missing operator.");
      toks.push({ t: "op", v: op }); i += op.length;
    }
    return toks;
  }

  function evaluate(expr, sh) {
    const toks = lex(expr);
    let p = 0;
    const peek = () => toks[p];
    const isOp = (v) => peek() && peek().t === "op" && peek().v === v;
    const getVal = (name) => {
      const raw = Shell.getVar(sh, name);
      if (raw == null) return 0;
      const n = parseInt(String(raw).trim(), /^0x/i.test(String(raw).trim()) ? 16 : 10);
      return isNaN(n) ? 0 : n | 0;
    };
    function comma() {
      let v = assign();
      while (isOp(",")) { p++; v = assign(); }
      return v;
    }
    function assign() {
      const t = peek(), n = toks[p + 1];
      if (t && t.t === "id" && n && n.t === "op" && /^(<<|>>|[*\/%+\-&^|])?=$/.test(n.v)) {
        p += 2;
        const rhs = assign();
        const cur = getVal(t.v);
        let v;
        switch (n.v) {
          case "=": v = rhs; break;
          case "+=": v = cur + rhs; break;
          case "-=": v = cur - rhs; break;
          case "*=": v = Math.imul(cur, rhs); break;
          case "/=": if (!rhs) throw new Error("Divide by zero error."); v = Math.trunc(cur / rhs); break;
          case "%=": if (!rhs) throw new Error("Divide by zero error."); v = cur % rhs; break;
          case "&=": v = cur & rhs; break;
          case "^=": v = cur ^ rhs; break;
          case "|=": v = cur | rhs; break;
          case "<<=": v = cur << rhs; break;
          case ">>=": v = cur >> rhs; break;
        }
        v |= 0;
        Shell.lib.setVar(sh, t.v, String(v));
        return v;
      }
      return bor();
    }
    function bin(next, opsList, fn) {
      return () => {
        let v = next();
        while (peek() && peek().t === "op" && opsList.includes(peek().v)) { const o = toks[p++].v; v = fn(o, v, next()) | 0; }
        return v;
      };
    }
    const mul = bin(unary, ["*", "/", "%"], (o, a, b) => {
      if (o === "*") return Math.imul(a, b);
      if (!b) throw new Error("Divide by zero error.");
      return o === "/" ? Math.trunc(a / b) : a % b;
    });
    const add = bin(mul, ["+", "-"], (o, a, b) => (o === "+" ? a + b : a - b));
    const shift = bin(add, ["<<", ">>"], (o, a, b) => (o === "<<" ? a << b : a >> b));
    const band = bin(shift, ["&"], (o, a, b) => a & b);
    const bxor = bin(band, ["^"], (o, a, b) => a ^ b);
    const bor = bin(bxor, ["|"], (o, a, b) => a | b);
    function unary() {
      if (isOp("-")) { p++; return -unary() | 0; }
      if (isOp("+")) { p++; return unary(); }
      if (isOp("!")) { p++; return unary() ? 0 : 1; }
      if (isOp("~")) { p++; return ~unary(); }
      return primary();
    }
    function primary() {
      const t = peek();
      if (!t) throw new Error("Missing operand.");
      if (t.t === "num") { p++; return t.v; }
      if (t.t === "id") { p++; return getVal(t.v); }
      if (isOp("(")) {
        p++;
        const v = comma();
        if (!isOp(")")) throw new Error("Unbalanced parenthesis.");
        p++;
        return v;
      }
      throw new Error("Missing operand.");
    }
    if (!toks.length) throw new Error("The syntax of the command is incorrect.");
    const v = comma();
    if (p < toks.length) throw new Error(isOp(")") ? "Unbalanced parenthesis." : "Missing operator.");
    return v;
  }

  return { evaluate };
})();
