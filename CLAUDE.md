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

## Verification
THIS IS KEY! You can interact with the app while npm run tauri dev is running on "http://localhost:1420/". For any UI changes, you should autonomously bugfix by using the chrome skill.