import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const LOCAL_IMPORT_RE = /^[ \t]*import\s+\{([^}]*)\}\s+from\s+['"](\.\.?\/[^'"]+)['"]\s*;?\s*$/gm;

function normalizePosix(p) {
  return path.posix.normalize(p.replace(/\\/g, '/')).replace(/^\.\//, '');
}

function parseImportAliases(clause) {
  const aliases = [];
  for (const raw of clause.split(',')) {
    const part = raw.trim();
    if (!part) continue;
    const m = part.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
    if (m) aliases.push({ orig: m[1], local: m[2] });
  }
  return aliases;
}

export function inlineLocalModules(templateHtml, readModule) {
  const scriptMatch = templateHtml.match(/(<script\s+type="module">)([\s\S]*?)(<\/script>)/i);
  if (!scriptMatch) return templateHtml;

  const [fullMatch, openTag, modBody, closeTag] = scriptMatch;
  const visited = new Set();
  const orderedModules = [];
  const aliases = [];

  function collect(relPath) {
    const norm = normalizePosix(relPath);
    if (visited.has(norm)) return;
    visited.add(norm);
    const src = readModule(norm);
    if (typeof src !== 'string') {
      throw new Error(`Cannot read local module: ${norm}`);
    }
    const dir = path.posix.dirname(norm);
    for (const m of src.matchAll(LOCAL_IMPORT_RE)) {
      const childPath = path.posix.join(dir, m[2]);
      collect(childPath);
    }
    const stripped = src
      .replace(LOCAL_IMPORT_RE, '')
      .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '')
      .trim();
    orderedModules.push({ path: norm, code: stripped });
  }

  let firstImportIdx = -1;
  const bodyWithoutLocalImports = modBody.replace(LOCAL_IMPORT_RE, (match, clause, spec, offset) => {
    if (firstImportIdx === -1) firstImportIdx = offset;
    aliases.push(...parseImportAliases(clause));
    collect(spec);
    return '';
  });

  if (orderedModules.length === 0) return templateHtml;

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

  return templateHtml.replace(fullMatch, `${openTag}${replacedBody}${closeTag}`);
}

export function buildStandaloneFromDisk(rootDir = process.cwd()) {
  const templatePath = path.join(rootDir, 'src', 'index.template.html');
  const outPath = path.join(rootDir, 'index.html');
  const templateHtml = fs.readFileSync(templatePath, 'utf8');
  const built = inlineLocalModules(templateHtml, (relPath) =>
    fs.readFileSync(path.join(rootDir, relPath), 'utf8')
  );
  fs.writeFileSync(outPath, built, 'utf8');
  return built;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildStandaloneFromDisk(process.cwd());
  console.log('Built standalone index.html from src/index.template.html');
}
