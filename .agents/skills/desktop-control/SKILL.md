---
name: desktop-control
description: >-
  Use this skill whenever the user asks the agent to interact with the desktop, GUI applications, mouse, or keyboard (e.g. clicking buttons, typing in external apps, taking screenshots of the OS desktop, navigating Windows programs).
---

# Desktop Control & Automation (Mouse, Keyboard & Screen)

This skill provides step-by-step guidance for operating the `desktop-controller` MCP server to interact directly with the Windows desktop.

## Available MCP Tools (`desktop-controller`)

### Mouse Control
- `mouse_click(x, y, button='left', clicks=1)`: Click at specific (x, y) coordinates or current position. Supports single or double clicks.
- `mouse_move(x, y, duration=0.2)`: Move the mouse pointer smoothly to coordinates.
- `mouse_drag(x, y, button='left', duration=0.5)`: Drag from current location to target.
- `mouse_scroll(clicks)`: Scroll wheel (positive = up, negative = down).
- `mouse_press(button)` / `mouse_release(button)`: Hold or release mouse button.
- `get_mouse_position()`: Get current cursor (x, y).

### Keyboard Control
- `keyboard_type(text)`: Type a string of text into the active element.
- `keyboard_press(key)`: Press a single key ('enter', 'tab', 'esc', 'space', 'f5', etc.).
- `keyboard_hotkey(keys=['ctrl', 'c'])`: Press key combinations (e.g., `['win', 'r']`, `['alt', 'tab']`, `['ctrl', 'shift', 'esc']`).
- `keyboard_key_down(key)` / `keyboard_key_up(key)`: Hold down or release a key.

### Screen & Windows Inspection
- `get_screen_size()`: Return monitor width and height in pixels (e.g., 1920x1080).
- `take_screenshot(file_path=None)`: Take a full-screen screenshot and save to disk.
- `get_active_window()`: Get title and coordinates of the focused window.
- `list_windows()`: List all visible application windows, titles, and bounding boxes.
- `focus_window(title_substr)`: Switch focus / restore the target window.

## Workflow Best Practices
1. **Window Focus**: Check `list_windows()` and invoke `focus_window("NomeDaJanela")` before sending keyboard inputs or clicks.
2. **Visual Verification**: When interacting with dynamic UIs, take a screenshot with `take_screenshot()` to inspect coordinates or confirm the UI state.
3. **Emergency Stop (Fail-safe)**: PyAutoGUI fail-safe is enabled. Moving the mouse pointer to the top-left corner (0,0) immediately aborts actions.
