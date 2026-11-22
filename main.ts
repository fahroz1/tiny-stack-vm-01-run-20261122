// Tiny stack VM: answers every instance of a make.fun tiny-stack-vm set.
// Plain JavaScript, Node 22. Input: MAKEFUN_INPUT_DIR (default /input);
// output: MAKEFUN_OUTPUT_DIR (default /output), relative to this file.
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const inDir = resolve(here, process.env.MAKEFUN_INPUT_DIR || "/input");
const outDir = resolve(here, process.env.MAKEFUN_OUTPUT_DIR || "/output");
const enc = new TextEncoder();

// Runs one bytecode program on its input bytes; returns {o: output, e: exit}.
function runVM(p, inp) {
  const n = p.length;
  const S = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const O = new Uint8Array(65536);
  let sp = 0, cp = 0, pc = 0, steps = 0, ol = 0, ip = 0;
  const fin = (e) => ({ o: O.slice(0, ol), e });

  for (;;) {
    if (steps === 1000000) return fin(10);
    if (pc < 0 || pc >= n) return fin(9);
    const op = p[pc];
    let im = 0, pops = 0, push = 0;
    if (op === 0x01) { im = 1; push = 1; }
    else if (op === 0x02) { im = 4; push = 1; }
    else if (op === 0x52) push = 1;
    else if (op === 0x04) { pops = 1; push = 2; }
    else if (op === 0x05) { pops = 2; push = 2; }
    else if (op === 0x06) { pops = 2; push = 3; }
    else if (op === 0x07) { pops = 3; push = 3; }
    else if (op === 0x41) pops = 2;
    else if (op === 0x03 || op === 0x17 || op === 0x1b || op === 0x31 ||
      op === 0x32 || op === 0x40 || op === 0x50 || op === 0x51 || op === 0x53)
      pops = 1;
    else if ((op >= 0x10 && op <= 0x16) || (op >= 0x18 && op <= 0x1a) ||
      (op >= 0x1c && op <= 0x1e) || (op >= 0x20 && op <= 0x22))
      { pops = 2; push = 1; }
    else if (op === 0x00 || op === 0x30 || op === 0x33 || op === 0x34) {}
    else return fin(5);
    if (op >= 0x30 && op <= 0x33) im = 2;
    if (pc + im >= n) return fin(9);
    steps++;
    const nx = pc + 1 + im;
    if (sp < pops) return fin(2);
    if (sp - pops + push > 256) return fin(3);
    pc = nx;

    switch (op) {
      case 0x00: return fin(0);
      case 0x01: S[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02:
        S[sp++] = p[nx - 4] | (p[nx - 3] << 8) | (p[nx - 2] << 16) | (p[nx - 1] << 24);
        break;
      case 0x03: sp--; break;
      case 0x04: S[sp] = S[sp - 1]; sp++; break;
      case 0x05: { const t = S[sp - 1]; S[sp - 1] = S[sp - 2]; S[sp - 2] = t; break; }
      case 0x06: S[sp] = S[sp - 2]; sp++; break;
      case 0x07: { const t = S[sp - 3]; S[sp - 3] = S[sp - 2]; S[sp - 2] = S[sp - 1]; S[sp - 1] = t; break; }
      case 0x17: S[sp - 1] = -S[sp - 1] | 0; break;
      case 0x1b: S[sp - 1] = ~S[sp - 1]; break;
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x18: case 0x19: case 0x1a: case 0x1c: case 0x1d:
      case 0x1e: case 0x20: case 0x21: case 0x22: {
        const b = S[sp - 1], a = S[sp - 2];
        let r;
        if (op === 0x10) r = (a + b) | 0;
        else if (op === 0x11) r = (a - b) | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) {
          if (b === 0) return fin(4);
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 0x14) {
          if (b === 0) return fin(4);
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 0x15) {
          if (b === 0) return fin(4);
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 0x16) {
          if (b === 0) return fin(4);
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        S[sp++] = r;
        break;
      }
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[nx - 2] | (p[nx - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 0x30) { const v = S[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33:
        if (cp === 64) return fin(7);
        C[cp++] = nx;
        pc = p[nx - 2] | (p[nx - 1] << 8);
        break;
      case 0x34:
        if (cp === 0) return fin(8);
        pc = C[--cp];
        break;
      case 0x40: {
        const addr = S[sp - 1];
        if (addr < 0 || addr >= 256) return fin(6);
        S[sp - 1] = M[addr];
        break;
      }
      case 0x41: {
        const addr = S[sp - 1], v = S[sp - 2];
        if (addr < 0 || addr >= 256) return fin(6);
        sp -= 2;
        M[addr] = v;
        break;
      }
      case 0x50: {
        const bytes = enc.encode(String(S[sp - 1]));
        if (ol + bytes.length > 65536) return fin(11);
        sp--;
        O.set(bytes, ol);
        ol += bytes.length;
        break;
      }
      case 0x51:
        if (ol + 1 > 65536) return fin(11);
        O[ol++] = S[--sp] & 255;
        break;
      case 0x52:
        S[sp++] = ip < inp.length ? inp[ip++] : -1;
        break;
      case 0x53: return fin(S[--sp] & 255);
    }
  }
}

// Answers every instance, writing <id>/stdout.bin and <id>/exit.txt.
const ids = readdirSync(inDir, { withFileTypes: true })
  .filter((d) => d.isDirectory()).map((d) => d.name).sort();
for (const id of ids) {
  const read = (f) => { try { return readFileSync(f); } catch { return Buffer.alloc(0); } };
  const prog = read(join(inDir, id, "program.bin"));
  const inp = read(join(inDir, id, "input.bin"));
  const r = runVM(prog, inp);
  const od = join(outDir, id);
  mkdirSync(od, { recursive: true });
  writeFileSync(join(od, "stdout.bin"), r.o);
  writeFileSync(join(od, "exit.txt"), String(r.e) + "\n");
}
