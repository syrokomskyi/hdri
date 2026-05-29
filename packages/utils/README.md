# @org/utils

Shared utility functions used across all packages in the monorepo.

## 📦 Package Information

- **Version**: 0.0.1
- **Publishable**: ❌ No (Private Package)
- **Tag**: `scope:shared`
- **Module Boundaries**: Base library - no external dependencies allowed

## 🔒 Private Package

This is an **internal library** that:
- Will NOT be published to NPM
- Provides shared utilities for other packages
- Serves as the foundation layer for the monorepo

## 🚀 Features

This package provides core utilities that are shared across all other packages:

- Common helper functions
- Shared types and interfaces
- Base utilities used by other packages in the workspace

## 📝 Usage

This package is automatically available to all other packages in the monorepo:

```typescript
// In any other package
import { someUtility } from '@org/utils';

// Use the shared functionality
const result = someUtility(input);
```

## 🏗️ Building

```bash
# Build the package
pnpm --dir packages/utils build

# The build output will be in packages/utils/dist
```

## 📋 Available Commands

```bash
pnpm --dir packages/utils build    # Build the package
pnpm --dir packages/utils lint     # Lint the package
```

## 🔒 Module Boundaries

This package has the tag `scope:shared` which means:
- **Can be imported by**: All packages in the workspace
- **Can import from**: Nothing (it's the base layer)

This ensures a clean dependency hierarchy where `utils` serves as the foundation without creating circular dependencies.

## 🏛️ Architecture Role

As the shared foundation of the monorepo:
1. Provides only generic, reusable utilities
2. Has no external dependencies beyond TypeScript's standard library
3. Ensures consistency across all packages

## ⚠️ Important Notes

- This package is marked as `"private": true` in package.json
- It is not intended for npm publishing
- Changes to this package may affect all other packages in the monorepo
- Keep utilities generic and well-tested as they form the foundation
