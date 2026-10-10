// Enforces the package rules from "Rules that keep main green" in
// docs/Paisa Path — Backend Design & Parallel Plan.md. Runs in CI via `npm run check`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// Which workspace packages each package may import. Editing this map is a
// contracts-level change: both track owners review it.
const ALLOWED = {
  '@paisa/contracts': [],
  '@paisa/engine': ['@paisa/contracts'],
  '@paisa/content': ['@paisa/contracts'],
  '@paisa/storygen': ['@paisa/contracts', '@paisa/content'],
  '@paisa/db': ['@paisa/contracts'],
  '@paisa/api': ['@paisa/contracts', '@paisa/engine', '@paisa/content', '@paisa/storygen', '@paisa/db'],
};

// Packages that must stay deterministic and free of I/O.
const PURE = new Set(['@paisa/contracts', '@paisa/engine']);
const IMPURE = [
  [/\bMath\.random\s*\(/, 'Math.random(): use the seeded RNG'],
  [/\bDate\.now\s*\(/, 'Date.now(): pass time in as an argument'],
  [/\bnew Date\s*\(\s*\)/, 'new Date(): pass time in as an argument'],
  [/\bperformance\.now\s*\(/, 'performance.now(): pass time in as an argument'],
  [/\bfetch\s*\(/, 'fetch(): no network access'],
  [/\bprocess\./, 'process.*: no environment access'],
];
const NODE_BUILTIN = /^(node:|fs$|path$|os$|http$|https$|net$|child_process$|crypto$|worker_threads$)/;
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

const errors = [];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx|mts|js|mjs)$/.test(name) ? [p] : [];
  });
}

const packageDirs = ['packages', 'apps'].flatMap((group) => {
  const base = join(root, group);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .map((name) => join(base, name))
    .filter((p) => existsSync(join(p, 'package.json')));
});

for (const pkgDir of packageDirs) {
  const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  const allowed = ALLOWED[pkg.name];
  if (!allowed) {
    errors.push(`${pkg.name}: not in ALLOWED in scripts/check-boundaries.mjs. Add it there (both owners review).`);
    continue;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  for (const dep of Object.keys(deps)) {
    if (dep.startsWith('@paisa/') && !allowed.includes(dep)) {
      errors.push(`${pkg.name}: package.json depends on ${dep}, which it may not import.`);
    }
  }

  for (const file of walk(join(pkgDir, 'src'))) {
    const rel = relative(root, file);
    const text = readFileSync(file, 'utf8');
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    for (const m of code.matchAll(IMPORT_RE)) {
      const spec = m[1] ?? m[2] ?? m[3];
      if (spec.startsWith('@paisa/')) {
        const base = spec.split('/').slice(0, 2).join('/');
        if (spec !== base) errors.push(`${rel}: deep import "${spec}". Import from "${base}" only.`);
        if (base !== pkg.name && !allowed.includes(base)) {
          errors.push(`${rel}: ${pkg.name} may not import ${base}.`);
        }
      } else if (spec.startsWith('.')) {
        const target = resolve(dirname(file), spec);
        if (!(target + sep).startsWith(pkgDir + sep) && target !== pkgDir) {
          errors.push(`${rel}: relative import "${spec}" leaves the package. Use the package's public API.`);
        }
      } else if (PURE.has(pkg.name) && NODE_BUILTIN.test(spec)) {
        errors.push(`${rel}: ${pkg.name} must stay pure; it may not import "${spec}".`);
      }
    }

    if (PURE.has(pkg.name)) {
      for (const [re, why] of IMPURE) {
        if (re.test(code)) errors.push(`${rel}: ${pkg.name} must stay pure: ${why}.`);
      }
    }
  }
}

if (errors.length) {
  console.error(`Boundary check failed (${errors.length}):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log(`Boundary check passed for ${packageDirs.length} packages.`);
