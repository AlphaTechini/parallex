# Documentation

This folder holds project documentation beyond the root overview. The repository map is in [structure.md](../structure.md) and the product overview is in [README.md](../README.md).

## Contents

- [demo-checklist.md](demo-checklist.md): acceptance checklist that maps every product acceptance family, plus the Firecrawl routing expectations, to an automated command or a manual provider-backed check. Use it to verify a deployment before a demo or release.

## Conventions

- Documentation is public-facing. It names only committed files and never references internal working notes or ignored specification files.
- Environment variables are documented by name and purpose. Values are never written into documentation.
- File references inside folder READMEs use direct `file:///` links so they resolve from any editor.
- Major features use two recurring sentence forms so logic stays greppable: "To find {logic} visit [filename](...)" and "The {system/connection} can be found in [filename](...)".
- Architecture notes record decisions and their tradeoffs, not just descriptions, so future changes can weigh the same constraints.
