# Web Client Build & Compilation Scripts (`src/scripts`)

## Overview
Build-time asset compilation utilities compiling markdown help documentation and what-new release logs into client JSON.

## Interface
- `HelpLocale` (`compile-help.ts`)
- `HelpSource` (`compile-help.ts`)
- `HelpLocaleContent` (`compile-help.ts`)
- `HelpParsedPage` (`compile-help.ts`)
- `HelpPage` (`compile-help.ts`)
- `HelpManifest` (`compile-help.ts`)
- `parseHelpMarkdown` (`compile-help.ts`)
- `compileHelpManifest` (`compile-help.ts`)

## Invariants
- [compile-help.ts] throw new Error('Invalid markdown format: missing frontmatter block');
- [compile-help.ts] throw new Error('Help page is missing a title');
- [compile-help.ts] throw new Error(`Help page "${title}" has a non-numeric order`);
- [compile-help.ts] throw new Error(`Help page "${title}" has an unknown audience role: ${role}`);
- [compile-help.ts] throw new Error(`Help page "${slug}" is missing its English source`);

## Side Effects
- None directly within pure UI/helper render paths.

## Verification
- Run: `npm test`
