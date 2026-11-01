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
- `PlatformTarget` (`compile-whats-new.ts`)
- `WhatsNewCategory` (`compile-whats-new.ts`)
- `WhatsNewItem` (`compile-whats-new.ts`)
- `WhatsNewRelease` (`compile-whats-new.ts`)
- `WhatsNewManifest` (`compile-whats-new.ts`)
- `resolveDraftRangeBase` (`compile-whats-new.ts`)
- `parseWhatsNewMarkdown` (`compile-whats-new.ts`)

## Invariants
- [compile-help.ts] throw new Error('Invalid markdown format: missing frontmatter block');
- [compile-help.ts] throw new Error('Help page is missing a title');
- [compile-help.ts] throw new Error(`Help page "${title}" has a non-numeric order`);
- [compile-help.ts] throw new Error(`Help page "${title}" has an unknown audience role: ${role}`);
- [compile-help.ts] throw new Error(`Help page "${slug}" is missing its English source`);
- [compile-whats-new.ts] throw new Error('Invalid markdown format: missing frontmatter block');

## Side Effects
- None directly within pure UI/helper render paths.

## Verification
- Run: `npm test`
