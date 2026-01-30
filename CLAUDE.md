# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A macOS app that generates provable theorems of propositional logic for users to prove using the natural deduction system. Key requirements:
- All generated theorems must be provable, with verifiable provability
- Support for indirect proof (assume negation → derive contradiction → prove proposition)
- Support for conditional proof (assume P → derive Q → conclude P → Q)
- Focus on easy-to-use UI/UX

Future scope: predicate logic (v2).
# Hammerspoon Shortcut Guide

Config location: `~/.hammerspoon/init.lua`

## Adding New Shortcuts

```lua
hs.hotkey.bind({"ctrl", "shift", "cmd"}, "KEY", function()
    -- your code here
end)
```

### Modifier Keys
- `cmd` = ⌘
- `ctrl` = ⌃
- `shift` = ⇧
- `alt` = ⌥

## Common Patterns

**Run a shell command:**
```lua
hs.hotkey.bind({"ctrl", "shift", "cmd"}, "x", function()
    hs.execute("your-command-here")
end)
```

**Open an app:**
```lua
hs.hotkey.bind({"ctrl", "shift", "cmd"}, "x", function()
    hs.application.open("AppName")
end)
```

**Run command in new Terminal (current Finder folder):**
```lua
hs.hotkey.bind({"ctrl", "shift", "cmd"}, "x", function()
    local script = [[
        set theDir to "~"
        tell application "Finder"
            if (count of windows) > 0 then
                set theDir to POSIX path of (target of front window as alias)
            end if
        end tell
        tell application "Terminal"
            activate
            do script "cd " & quoted form of theDir & " && your-command"
        end tell
    ]]
    hs.osascript.applescript(script)
end)
```

**Show alert:**
```lua
hs.alert.show("Message", 2)  -- 2 = seconds
```

## After Editing

Reload config:
```bash
pkill -x Hammerspoon && open -a Hammerspoon
```

