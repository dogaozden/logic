# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A macOS app that generates provable theorems of propositional logic for users to prove using the natural deduction system. Key requirements:
- All generated theorems must be provable, with verifiable provability
- Support for indirect proof (assume negation → derive contradiction → prove proposition)
- Support for conditional proof (assume P → derive Q → conclude P → Q)
- Focus on easy-to-use UI/UX

Future scope: predicate logic (v2).

## After Adding New Features

After implementing any new feature or fix, always build and install the release version.

## Update Documentation

After implementing any new feature or fix, always update documentation.md in /logic-proof-trainer

## PropBench: Keep GUI in sync with CLI

When changing model names, default parameters, CLI arguments, or any configuration in the PropBench CLI or harness (`prop-bench/models/`, `prop-bench/harness.ts`, `prop-bench/config.ts`), always update the corresponding GUI code to match:
- Model names/defaults → `prop-bench/gui/src/components/RunConfig.tsx` (MODEL_OPTIONS)
- CLI arguments → `prop-bench/gui/server/cli.ts` (spawnHarness)
- Documentation → `prop-bench/COMMANDS.md` (Model Aliases table)