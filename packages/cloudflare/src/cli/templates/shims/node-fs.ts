// https://github.com/vercel/next.js/blob/canary/packages/next/src/server/lib/node-fs-methods.ts

export const nodeFs = {
  existsSync,
  readFile,
  readFileSync,
  writeFile,
  mkdir,
  stat,
};

const FILES = new Map<string, unknown>();
const MTIME = Date.now();

function existsSync(path: string) {
  console.log("existsSync", path, new Error().stack?.split("\n").slice(1).join("\n"));
  return FILES.has(path);
}

async function readFile(path: string, options: unknown): Promise<unknown> {
  console.log(
    "readFile",
    { path, options }
    // new Error().stack.split("\n").slice(1).join("\n"),
  );
  if (!FILES.has(path)) {
    throw new Error(path + "does not exist");
  }
  return FILES.get(path);
}

function readFileSync(path: string, options: unknown) {
  console.log(
    "readFileSync",
    { path, options }
    // new Error().stack.split("\n").slice(1).join("\n"),
  );
  if (!FILES.has(path)) {
    throw new Error(path + "does not exist");
  }
  return FILES.get(path);
}

async function writeFile(file: string, data: unknown) {
  console.log(
    "writeFile",
    { file, data }
    // new Error().stack.split("\n").slice(1).join("\n"),
  );
  FILES.set(file, data);
  return true;
}

async function mkdir(dir: string) {
  console.log(
    "mkdir",
    dir
    //new Error().stack.split("\n").slice(1).join("\n"),
  );
}

async function stat(file: string) {
  console.log(
    "stat",
    file
    // new Error().stack.split("\n").slice(1).join("\n"),
  );
  return { mtime: new Date(MTIME) };
}
