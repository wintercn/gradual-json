const EOF = Symbol("EOF");

export type Character = string;
export type ChunkSource = AsyncIterable<string>;

type JsonObject = { [key: string]: JsonValue };
export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type State = (char: Character | typeof EOF) => State;

/** Parses async string chunks, progressively writes host[property], and returns the JSON root after EOF validation. */
export async function parse(
  chunks: ChunkSource,
  host: object = {},
  property: string = "root",
): Promise<JsonValue> {
  const containers: (JsonObject | JsonValue[])[] = [host as JsonObject];
  let pendingKey: string | undefined = property;
  let literal = "";
  let hexValue = 0;
  let state: State = VA;

  function VA(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in VA");
    if (char === " " || char === "\t" || char === "\r" || char === "\n") return VA;
    if (char === "{") {
      const object: JsonObject = {};
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(object);
        containers.push(parent[parent.length - 1]! as JsonObject);
      } else {
        parent[pendingKey!] = object;
        containers.push(parent[pendingKey!]! as JsonObject);
        pendingKey = undefined;
      }
      return OB;
    }
    if (char === "[") {
      const array: JsonValue[] = [];
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(array);
        containers.push(parent[parent.length - 1]! as JsonValue[]);
      } else {
        parent[pendingKey!] = array;
        containers.push(parent[pendingKey!]! as JsonValue[]);
        pendingKey = undefined;
      }
      return AR;
    }
    if (char === '"') {
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(literal);
      } else {
        parent[pendingKey!] = literal;
      }
      return ST;
    }
    if (char === "-") { literal = "-"; return MI; }
    if (char === "0") { literal = "0"; return ZE; }
    if (char >= "1" && char <= "9") { literal = char; return IN; }
    if (char === "t") return T1;
    if (char === "f") return F1;
    if (char === "n") return N1;
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in VA`);
  }

  function OK(char: Character | typeof EOF): State {
    if (char === EOF) {
      if (containers.length !== 1) throw new SyntaxError("Unexpected end of JSON input in OK");
      return OK;
    }
    if (char === " " || char === "\t" || char === "\r" || char === "\n") return OK;
    if (containers.length === 1) throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in OK`);
    const parent = containers[containers.length - 1]!;
    if (Array.isArray(parent)) {
      if (char === ",") return VA;
      if (char === "]") {
        containers.pop();
        return OK;
      }
    } else {
      if (char === ",") return KE;
      if (char === "}") {
        containers.pop();
        return OK;
      }
    }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in OK`);
  }

  function OB(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in OB");
    if (char === " " || char === "\t" || char === "\r" || char === "\n") return OB;
    if (char === "}") {
      const object = containers[containers.length - 1];
      if (object === undefined || Array.isArray(object)) {
        throw new Error("Parser invariant: object end without an object on top");
      }
      containers.pop();
      return OK;
    }
    if (char === '"') { literal = ""; return KST; }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in OB`);
  }

  function KE(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in KE");
    if (char === " " || char === "\t" || char === "\r" || char === "\n") return KE;
    if (char === '"') { literal = ""; return KST; }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in KE`);
  }

  function CO(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in CO");
    if (char === " " || char === "\t" || char === "\r" || char === "\n") return CO;
    if (char === ":") return VA;
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in CO`);
  }

  function AR(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in AR");
    if (char === " " || char === "\t" || char === "\r" || char === "\n") return AR;
    if (char === "]") {
      const array = containers[containers.length - 1];
      if (!Array.isArray(array)) throw new Error("Parser invariant: array end without an array on top");
      containers.pop();
      return OK;
    }
    return VA(char);
  }

  function KST(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in KST");
    if (char === '"') {
      pendingKey = literal;
      literal = "";
      return CO;
    }
    if (char === "\\") return KES;
    if (char.charCodeAt(0) < 0x20) throw new SyntaxError("Unescaped control character in KST");
    literal += char;
    return KST;
  }

  function KES(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in KES");
    switch (char) {
      case '"': case "\\": case "/": literal += char; return KST;
      case "b": literal += "\b"; return KST;
      case "f": literal += "\f"; return KST;
      case "n": literal += "\n"; return KST;
      case "r": literal += "\r"; return KST;
      case "t": literal += "\t"; return KST;
      case "u": hexValue = 0; return KU1;
      default: throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in KES`);
    }
  }

  function KU1(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in KU1");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in KU1");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    return KU2;
  }

  function KU2(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in KU2");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in KU2");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    return KU3;
  }

  function KU3(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in KU3");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in KU3");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    return KU4;
  }

  function KU4(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in KU4");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in KU4");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    literal += String.fromCharCode(hexValue);
    return KST;
  }

  function ST(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in ST");
    if (char === '"') {
      literal = "";
      pendingKey = undefined;
      return OK;
    }
    if (char === "\\") return ES;
    if (char.charCodeAt(0) < 0x20) throw new SyntaxError("Unescaped control character in ST");
    literal += char;
    const parent = containers[containers.length - 1]!;
    if (Array.isArray(parent)) {
      parent[parent.length - 1] = literal;
    } else {
      parent[pendingKey!] = literal;
    }
    return ST;
  }

  function ES(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in ES");
    switch (char) {
      case '"': case "\\": case "/": literal += char; break;
      case "b": literal += "\b"; break;
      case "f": literal += "\f"; break;
      case "n": literal += "\n"; break;
      case "r": literal += "\r"; break;
      case "t": literal += "\t"; break;
      case "u": hexValue = 0; return U1;
      default: throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in ES`);
    }
    const parent = containers[containers.length - 1]!;
    if (Array.isArray(parent)) {
      parent[parent.length - 1] = literal;
    } else {
      parent[pendingKey!] = literal;
    }
    return ST;
  }

  function U1(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in U1");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in U1");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    return U2;
  }

  function U2(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in U2");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in U2");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    return U3;
  }

  function U3(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in U3");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in U3");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    return U4;
  }

  function U4(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in U4");
    if (!((char >= "0" && char <= "9") || (char >= "a" && char <= "f") || (char >= "A" && char <= "F"))) {
      throw new SyntaxError("Invalid Unicode escape in U4");
    }
    hexValue = hexValue * 16 + Number.parseInt(char, 16);
    literal += String.fromCharCode(hexValue);
    const parent = containers[containers.length - 1]!;
    if (Array.isArray(parent)) {
      parent[parent.length - 1] = literal;
    } else {
      parent[pendingKey!] = literal;
    }
    return ST;
  }

  function MI(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in MI");
    if (char >= "0" && char <= "9") {
      literal += char;
      return char === "0" ? ZE : IN;
    }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in MI`);
  }

  function ZE(char: Character | typeof EOF): State {
    if (char === EOF) {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(EOF);
    }
    if (char === ".") { literal += char; return FR; }
    if (char === "e" || char === "E") { literal += char; return E1; }
    if (char === " " || char === "\t" || char === "\r" || char === "\n" || char === "," || char === "]" || char === "}") {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(char);
    }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in ZE`);
  }

  function IN(char: Character | typeof EOF): State {
    if (char === EOF) {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(EOF);
    }
    if (char >= "0" && char <= "9") { literal += char; return IN; }
    if (char === ".") { literal += char; return FR; }
    if (char === "e" || char === "E") { literal += char; return E1; }
    if (char === " " || char === "\t" || char === "\r" || char === "\n" || char === "," || char === "]" || char === "}") {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(char);
    }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in IN`);
  }

  function FS(char: Character | typeof EOF): State {
    if (char === EOF) {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(EOF);
    }
    if (char >= "0" && char <= "9") { literal += char; return FS; }
    if (char === "e" || char === "E") { literal += char; return E1; }
    if (char === " " || char === "\t" || char === "\r" || char === "\n" || char === "," || char === "]" || char === "}") {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(char);
    }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in FS`);
  }

  function E3(char: Character | typeof EOF): State {
    if (char === EOF) {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(EOF);
    }
    if (char >= "0" && char <= "9") { literal += char; return E3; }
    if (char === " " || char === "\t" || char === "\r" || char === "\n" || char === "," || char === "]" || char === "}") {
      const raw = literal;
      const value = Number(raw);
      literal = "";
      const parent = containers[containers.length - 1]!;
      if (Array.isArray(parent)) {
        parent.push(value);
      } else {
        parent[pendingKey!] = value;
        pendingKey = undefined;
      }
      return OK(char);
    }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in E3`);
  }

  function FR(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in FR");
    if (char >= "0" && char <= "9") { literal += char; return FS; }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in FR`);
  }

  function E1(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in E1");
    if (char === "+" || char === "-") { literal += char; return E2; }
    if (char >= "0" && char <= "9") { literal += char; return E3; }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in E1`);
  }

  function E2(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in E2");
    if (char >= "0" && char <= "9") { literal += char; return E3; }
    throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in E2`);
  }

  function T1(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in T1");
    if (char !== "r") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in T1`);
    return T2;
  }

  function T2(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in T2");
    if (char !== "u") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in T2`);
    return T3;
  }

  function T3(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in T3");
    if (char !== "e") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in T3`);
    const value = true;
    const parent = containers[containers.length - 1]!;
    if (Array.isArray(parent)) {
      parent.push(value);
    } else {
      parent[pendingKey!] = value;
      pendingKey = undefined;
    }
    return OK;
  }

  function F1(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in F1");
    if (char !== "a") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in F1`);
    return F2;
  }

  function F2(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in F2");
    if (char !== "l") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in F2`);
    return F3;
  }

  function F3(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in F3");
    if (char !== "s") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in F3`);
    return F4;
  }

  function F4(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in F4");
    if (char !== "e") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in F4`);
    const value = false;
    const parent = containers[containers.length - 1]!;
    if (Array.isArray(parent)) {
      parent.push(value);
    } else {
      parent[pendingKey!] = value;
      pendingKey = undefined;
    }
    return OK;
  }

  function N1(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in N1");
    if (char !== "u") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in N1`);
    return N2;
  }

  function N2(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in N2");
    if (char !== "l") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in N2`);
    return N3;
  }

  function N3(char: Character | typeof EOF): State {
    if (char === EOF) throw new SyntaxError("Unexpected end of JSON input in N3");
    if (char !== "l") throw new SyntaxError(`Unexpected ${JSON.stringify(char)} in N3`);
    const value = null;
    const parent = containers[containers.length - 1]!;
    if (Array.isArray(parent)) {
      parent.push(value);
    } else {
      parent[pendingKey!] = value;
      pendingKey = undefined;
    }
    return OK;
  }

  const ordinaryCharacters = /[^"\\\x00-\x1f]+/y;
  for await (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i++) {
      if (state === ST || state === KST) {
        // shortcut: consume continuous ordinary string characters without changing state.
        ordinaryCharacters.lastIndex = i;
        const match = ordinaryCharacters.exec(chunk);
        if (match !== null) {
          literal += match[0];
          if (state === ST) {
            const parent = containers[containers.length - 1]!;
            if (Array.isArray(parent)) {
              parent[parent.length - 1] = literal;
            } else {
              parent[pendingKey!] = literal;
            }
          }
          i = ordinaryCharacters.lastIndex - 1;
          continue;
        }
      }
      state = state(chunk[i]!);
    }
  }

  // Every state handles EOF; complete numbers delegate it directly to OK.
  state = state(EOF);
  return (containers[0] as JsonObject)[property]!;
}
