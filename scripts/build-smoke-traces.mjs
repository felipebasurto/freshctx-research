#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const REPOS = join(ROOT, "bench", "repos");
const OUT = join(ROOT, "bench", "traces", "smoke");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function region(content, startLine, endLine) {
  return content.replaceAll("\r\n", "\n").split("\n").slice(startLine - 1, endLine).join("\n");
}

function goldAfterMutation(content, initialRegion) {
  const lineCount = initialRegion.split("\n").length;
  const anchor = initialRegion.split("\n")[0];
  const lines = content.split("\n");
  const start = lines.findIndex((line) => line === anchor);
  if (start === -1) throw new Error(`anchor missing after mutation: ${anchor}`);
  return lines.slice(start, start + lineCount).join("\n");
}

async function readRepo(repoId, filePath) {
  return (await readFile(join(REPOS, repoId, filePath), "utf8")).replaceAll("\r\n", "\n");
}

async function writeTrace(name, trace) {
  await writeFile(join(OUT, `${name}.json`), `${JSON.stringify(trace, null, 2)}\n`);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const lock = JSON.parse(await readFile(join(ROOT, "bench", "repos.lock.json"), "utf8"));

  const flaskCommit = lock.repositories.flask.commit;
  const expressCommit = lock.repositories.express.commit;

  const helpers = await readRepo("flask", "src/flask/helpers.py");
  const views = await readRepo("flask", "src/flask/views.py");
  const mainPy = await readRepo("flask", "src/flask/__main__.py");
  const expressJs = await readRepo("express", "lib/express.js");

  const flaskSource = {
    repository: "https://github.com/pallets/flask.git",
    commit: flaskCommit,
    license: "BSD-3-Clause",
  };
  const expressSource = {
    repository: "https://github.com/expressjs/express.git",
    commit: expressCommit,
    license: "MIT",
  };

  const viewClassDoc = region(views, 17, 46);
  const viewClassDocMutated = viewClassDoc.replace(
    "    will not be applied to the generated view function!",
    "    will not be applied to the generated view function! Smoke interior edit.",
  );

  await writeTrace("flask-interior-edit", {
    schemaVersion: 1,
    name: "flask/interior-edit/view-class-doc",
    source: flaskSource,
    initialFiles: { "src/flask/views.py": views },
    events: [
      { type: "read", path: "src/flask/views.py", scope: "region", startLine: 17, endLine: 46, selector: "View.doc" },
      {
        type: "capture-request",
        task: "refresh class-based view documentation",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/views.py", selector: "View.doc", sha256: sha256(viewClassDoc) }],
      },
      {
        type: "replace-exact",
        path: "src/flask/views.py",
        expected: "    will not be applied to the generated view function!",
        replacement: "    will not be applied to the generated view function! Smoke interior edit.",
      },
      {
        type: "capture-request",
        task: "refresh class-based view documentation",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/views.py", selector: "View.doc", sha256: sha256(viewClassDocMutated) }],
      },
    ],
  });

  const classNeedle = "class View:";
  const classReplacement = "# smoke-append marker\n\nclass View:";
  const viewsAfterAppend = views.replace(classNeedle, classReplacement);
  const viewClassDocAfterAppend = goldAfterMutation(viewsAfterAppend, viewClassDoc);

  await writeTrace("flask-append", {
    schemaVersion: 1,
    name: "flask/append/view-class-doc",
    source: flaskSource,
    initialFiles: { "src/flask/views.py": views },
    events: [
      { type: "read", path: "src/flask/views.py", scope: "region", startLine: 17, endLine: 46, selector: "View.doc" },
      {
        type: "capture-request",
        task: "inspect class-based view documentation",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/views.py", selector: "View.doc", sha256: sha256(viewClassDoc) }],
      },
      { type: "replace-exact", path: "src/flask/views.py", expected: classNeedle, replacement: classReplacement },
      {
        type: "capture-request",
        task: "inspect class-based view documentation",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/views.py", selector: "View.doc", sha256: sha256(viewClassDocAfterAppend) }],
      },
    ],
  });

  await writeTrace("flask-delete", {
    schemaVersion: 1,
    name: "flask/delete/main-entry",
    source: flaskSource,
    initialFiles: {
      "src/flask/__main__.py": mainPy,
      "src/flask/helpers.py": helpers,
    },
    events: [
      { type: "read", path: "src/flask/__main__.py", scope: "file" },
      {
        type: "capture-request",
        task: "review cli entrypoint",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/__main__.py", sha256: sha256(mainPy) }],
      },
      { type: "delete-file", path: "src/flask/__main__.py" },
      {
        type: "capture-request",
        task: "review cli entrypoint",
        budgetChars: 12000,
        requiredUnits: [],
      },
    ],
  });

  const methodFuncs = region(views, 11, 13);
  const methodNeedle = `${methodFuncs}\n\n\nclass View:`;
  const methodReplacement = "class View:";
  const viewsMoved = `${views.replace(methodNeedle, methodReplacement).trimEnd()}\n\n${methodFuncs}\n`;

  await writeTrace("flask-move-in-file", {
    schemaVersion: 1,
    name: "flask/move-in-file/http-method-funcs",
    source: flaskSource,
    initialFiles: { "src/flask/views.py": views },
    events: [
      { type: "read", path: "src/flask/views.py", scope: "region", startLine: 11, endLine: 13, selector: "http_method_funcs" },
      {
        type: "capture-request",
        task: "adjust HTTP method helpers",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/views.py", selector: "http_method_funcs", sha256: sha256(methodFuncs) }],
      },
      { type: "replace-exact", path: "src/flask/views.py", expected: views, replacement: viewsMoved },
      {
        type: "capture-request",
        task: "adjust HTTP method helpers",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/views.py", selector: "http_method_funcs", sha256: sha256(methodFuncs) }],
      },
    ],
  });

  const viewDispatch = region(views, 78, 83);
  const dupNeedle = viewDispatch;
  const dupInsert = `${viewDispatch}\n\n    def dispatch_request_duplicate(self):\n        ${region(views, 79, 82).split("\n").join("\n        ")}\n`;
  const viewsDup = views.replace(dupNeedle, dupInsert);
  const dupRegion = region(viewsDup, 78, 83);

  await writeTrace("flask-duplicate-boundary", {
    schemaVersion: 1,
    name: "flask/duplicate-boundary/view-dispatch",
    source: flaskSource,
    initialFiles: { "src/flask/views.py": views },
    events: [
      { type: "read", path: "src/flask/views.py", scope: "region", startLine: 78, endLine: 83, selector: "View.dispatch_request" },
      {
        type: "capture-request",
        task: "resolve duplicated dispatch bodies",
        budgetChars: 12000,
        requiredUnits: [{ path: "src/flask/views.py", selector: "View.dispatch_request", sha256: sha256(viewDispatch) }],
      },
      { type: "replace-exact", path: "src/flask/views.py", expected: dupNeedle, replacement: dupInsert },
      {
        type: "capture-request",
        task: "resolve duplicated dispatch bodies",
        budgetChars: 12000,
        requiredUnits: [],
      },
    ],
  });

  const createFn = region(expressJs, 36, 56);
  const createMutated = createFn.replace(
    "  // expose the prototype that will get set on requests",
    "  // expose the request prototype used by the application",
  );

  await writeTrace("express-interior-edit", {
    schemaVersion: 1,
    name: "express/interior-edit/create-application",
    source: expressSource,
    initialFiles: { "lib/express.js": expressJs },
    events: [
      { type: "read", path: "lib/express.js", scope: "region", startLine: 36, endLine: 56, selector: "createApplication" },
      {
        type: "capture-request",
        task: "review application factory",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/express.js", selector: "createApplication", sha256: sha256(createFn) }],
      },
      {
        type: "replace-exact",
        path: "lib/express.js",
        expected: "  // expose the prototype that will get set on requests",
        replacement: "  // expose the request prototype used by the application",
      },
      {
        type: "capture-request",
        task: "review application factory",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/express.js", selector: "createApplication", sha256: sha256(createMutated) }],
      },
    ],
  });

  const fnNeedle = "function createApplication() {";
  const fnReplacement = "// smoke-append marker\n\nfunction createApplication() {";
  const expressAfterAppend = expressJs.replace(fnNeedle, fnReplacement);
  const createAfterAppend = goldAfterMutation(expressAfterAppend, createFn);

  await writeTrace("express-append", {
    schemaVersion: 1,
    name: "express/append/create-application",
    source: expressSource,
    initialFiles: { "lib/express.js": expressJs },
    events: [
      { type: "read", path: "lib/express.js", scope: "region", startLine: 36, endLine: 56, selector: "createApplication" },
      {
        type: "capture-request",
        task: "review application factory",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/express.js", selector: "createApplication", sha256: sha256(createFn) }],
      },
      { type: "replace-exact", path: "lib/express.js", expected: fnNeedle, replacement: fnReplacement },
      {
        type: "capture-request",
        task: "review application factory",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/express.js", selector: "createApplication", sha256: sha256(createAfterAppend) }],
      },
    ],
  });

  const smokeTemp = "'use strict';\n\nmodule.exports = function smokeTemp() {\n  return 'temp';\n};\n";
  const expressWithTemp = expressJs;

  await writeTrace("express-delete", {
    schemaVersion: 1,
    name: "express/delete/smoke-temp",
    source: expressSource,
    initialFiles: {
      "lib/express.js": expressWithTemp,
      "lib/smoke-temp.js": smokeTemp,
    },
    events: [
      { type: "read", path: "lib/smoke-temp.js", scope: "file" },
      {
        type: "capture-request",
        task: "review temp helper",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/smoke-temp.js", sha256: sha256(smokeTemp) }],
      },
      { type: "delete-file", path: "lib/smoke-temp.js" },
      {
        type: "capture-request",
        task: "review temp helper",
        budgetChars: 12000,
        requiredUnits: [],
      },
    ],
  });

  const prototypeBlock = "exports.application = proto;\nexports.request = req;\nexports.response = res;";
  const prototypeNeedle = `${prototypeBlock}\n\n/**\n * Expose constructors.`;
  const prototypeReplacement = "/**\n * Expose constructors.";
  const expressMoved = `${expressJs.replace(prototypeNeedle, prototypeReplacement).trimEnd()}\n\n${prototypeBlock}\n`;
  const prototypeRegion = region(expressJs, 62, 64);
  const prototypeMoved = region(expressMoved, expressMoved.split("\n").length - 3, expressMoved.split("\n").length - 1);

  await writeTrace("express-move-in-file", {
    schemaVersion: 1,
    name: "express/move-in-file/prototype-exports",
    source: expressSource,
    initialFiles: { "lib/express.js": expressJs },
    events: [
      { type: "read", path: "lib/express.js", scope: "region", startLine: 62, endLine: 64, selector: "prototype-exports" },
      {
        type: "capture-request",
        task: "review export surface",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/express.js", selector: "prototype-exports", sha256: sha256(prototypeRegion) }],
      },
      { type: "replace-exact", path: "lib/express.js", expected: prototypeNeedle, replacement: prototypeReplacement },
      {
        type: "replace-exact",
        path: "lib/express.js",
        expected: "exports.urlencoded = bodyParser.urlencoded\n",
        replacement: `exports.urlencoded = bodyParser.urlencoded\n\n${prototypeBlock}\n`,
      },
      {
        type: "capture-request",
        task: "review export surface",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/express.js", selector: "prototype-exports", sha256: sha256(prototypeRegion) }],
      },
    ],
  });

  const dupMarker = "exports.static = require('serve-static');";
  const dupReplacement = `${dupMarker}\nexports.staticAlias = require('serve-static');`;
  const expressDup = expressJs.replace(dupMarker, dupReplacement);

  await writeTrace("express-duplicate-boundary", {
    schemaVersion: 1,
    name: "express/duplicate-boundary/static-export",
    source: expressSource,
    initialFiles: { "lib/express.js": expressJs },
    events: [
      { type: "read", path: "lib/express.js", scope: "region", startLine: 73, endLine: 81, selector: "middleware-exports" },
      {
        type: "capture-request",
        task: "resolve duplicated static exports",
        budgetChars: 12000,
        requiredUnits: [{ path: "lib/express.js", selector: "middleware-exports", sha256: sha256(region(expressJs, 73, 81)) }],
      },
      { type: "replace-exact", path: "lib/express.js", expected: dupMarker, replacement: dupReplacement },
      {
        type: "capture-request",
        task: "resolve duplicated static exports",
        budgetChars: 12000,
        requiredUnits: [],
      },
    ],
  });

  process.stdout.write(`Wrote smoke traces to ${OUT}\n`);
}

await main();
