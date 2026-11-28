import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { pathToFileURL } from 'url';

const LOCAL_IMPORT_RE = /^[ \t]*import\s+\{([^}]*)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\s*$/gm;
const EXPORT_DECL_RE = /^export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;
const TOP_LEVEL_DECL_RE = /^(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/gm;

function normalizePosix(p) {
  return path.posix.normalize(p.replace(/\\/g, '/')).replace(/^\.\//, '');
}

function parseImportSpecifiers(clause) {
  const specs = [];
  for (const raw of clause.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
    if (m) {
      specs.push({ orig: m[1], local: m[2] || m[1] });
    }
  }
  return specs;
}

function extractExportedNames(src) {
  const names = new Set();
  for (const m of src.matchAll(EXPORT_DECL_RE)) {
    names.add(m[1]);
  }
  return names;
}

export function inlineLocalModules(templateHtml, readModule) {
  const scriptMatch = templateHtml.match(/(<script\s+type="module">)([\s\S]*?)(<\/script>)/i);
  if (!scriptMatch) return templateHtml;

  const [fullMatch, openTag, modBody, closeTag] = scriptMatch;
  const visited = new Set();
  const inStack = new Set();
  const exportsByPath = new Map();
  const orderedModules = [];
  const aliases = [];

  function collect(relPath, requiredNames = []) {
    const norm = normalizePosix(relPath);
    if (inStack.has(norm)) {
      throw new Error(`Circular dependency detected while bundling: ${norm}`);
    }

    let exported = exportsByPath.get(norm);
    if (!visited.has(norm)) {
      inStack.add(norm);
      const src = readModule(norm);
      if (typeof src !== 'string') {
        throw new Error(`Cannot read local module: ${norm}`);
      }
      exported = extractExportedNames(src);
      exportsByPath.set(norm, exported);

      const dir = path.posix.dirname(norm);
      for (const m of src.matchAll(LOCAL_IMPORT_RE)) {
        const childSpecs = parseImportSpecifiers(m[1]);
        const childPath = path.posix.join(dir, m[2]);
        collect(
          childPath,
          childSpecs.map((s) => s.orig)
        );
      }

      const stripped = src
        .replace(LOCAL_IMPORT_RE, '')
        .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
        .trim();

      inStack.delete(norm);
      visited.add(norm);
      orderedModules.push({ path: norm, code: stripped });
    }

    for (const name of requiredNames) {
      if (!exported || !exported.has(name)) {
        throw new Error(`Missing export "${name}" in module ${norm}`);
      }
    }
  }

  let firstImportIdx = -1;
  const bodyWithoutLocalImports = modBody.replace(LOCAL_IMPORT_RE, (_match, clause, spec, offset) => {
    if (firstImportIdx === -1) firstImportIdx = offset;
    const specs = parseImportSpecifiers(clause);
    for (const s of specs) {
      if (s.local !== s.orig) aliases.push({ orig: s.orig, local: s.local });
    }
    collect(
      spec,
      specs.map((s) => s.orig)
    );
    return '';
  });

  if (orderedModules.length === 0) return templateHtml;

  // Fail fast on top-level symbol collisions across inlined modules
  const declaredSymbols = new Map();
  for (const mod of orderedModules) {
    for (const m of mod.code.matchAll(TOP_LEVEL_DECL_RE)) {
      const sym = m[1];
      if (declaredSymbols.has(sym)) {
        throw new Error(
          `Top-level symbol collision: "${sym}" declared in both ${declaredSymbols.get(sym)} and ${mod.path}`
        );
      }
      declaredSymbols.set(sym, mod.path);
    }
  }

  const bundleLines = ['    /* INLINED-LOCAL-MODULES-START */'];
  for (const mod of orderedModules) {
    bundleLines.push(`    // --- ${mod.path} ---`);
    for (const line of mod.code.split(/\r?\n/)) {
      bundleLines.push(line ? `    ${line}` : '');
    }
  }
  for (const a of aliases) {
    bundleLines.push(`    const ${a.local} = ${a.orig};`);
  }
  bundleLines.push('    /* INLINED-LOCAL-MODULES-END */');

  const bundleBlock = bundleLines.join('\n') + '\n';
  const replacedBody =
    bodyWithoutLocalImports.slice(0, firstImportIdx) +
    bundleBlock +
    bodyWithoutLocalImports.slice(firstImportIdx).replace(/^\s*\n/, '\n');

  // Use a function replacer so literal $&, $', $`, $$ in bundled JS are never corrupted
  return templateHtml.replace(fullMatch, () => `${openTag}${replacedBody}${closeTag}`);
}

export function buildStandaloneFromDisk(rootDir = process.cwd()) {
  const templatePath = path.join(rootDir, 'src', 'index.template.html');
  const outPath = path.join(rootDir, 'index.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const built = inlineLocalModules(templateHtml, (relPath) =>
    fs.readFileSync(path.join(rootDir, relPath), 'utf8')
  );

  // Verify generated inline ES module parses cleanly before writing final output
  const modMatch = built.match(/<script\s+type="module">([\s\S]*?)<\/script>/i);
  if (modMatch) {
    const tmpFile = path.join(rootDir, `.tmp-build-check-${process.pid}.mjs`);
    fs.writeFileSync(tmpFile, modMatch[1], 'utf8');
    try {
      execFileSync(process.execPath, ['--check', tmpFile], { stdio: 'pipe' });
    } finally {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    }
  }

  fs.writeFileSync(outPath, built, 'utf8');
  return built;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildStandaloneFromDisk(process.cwd());
  console.log('Built standalone index.html from src/index.template.html');
}
