# TT Design Brew Studio - Design Specification

This document describes the visual design language for the TT Design Brew Studio
mentor canvas. Edit this file to express your design preferences, then ask the
agent to update the design tokens accordingly.

You can also edit `tokens.json` directly for immediate changes.

## Brand

- **Name**: TT Design Brew Studio
- **Personality**: calm, critical, educational, and canvas-native
- **Primary color**: Blue (#2563EB) — used as a stable action color; expert and student states use semantic accent colors

## Color Palette

| Purpose | Color | Hex |
|---------|-------|-----|
| Primary action | Blue | #2563EB |
| Primary hover | Dark blue | #1D4ED8 |
| Background | White | #FFFFFF |
| Surface (cards) | Light gray | #F8FAFC |
| Primary text | Dark slate | #1E293B |
| Secondary text | Slate | #64748B |
| Borders | Light slate | #E2E8F0 |
| Success | Green | #16A34A |
| Warning | Amber | #F59E0B |
| Danger / Blocking | Red | #DC2626 |
| Blocking background | Light red | #FEF2F2 |
| Blocking border | Light coral | #FCA5A5 |
| Interactive background | Light orange | #FFF7ED |
| Interactive border | Light amber | #FDBA74 |

## Typography

- **Body font**: System font stack (-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)
  - Rationale: Native feel, fast loading, no web font dependency
- **Code font**: 'SF Mono', 'Fira Code', monospace
- **Base size**: 16px — improved readability for dense review screens
- **Line height**: 1.6 — generous for comfortable reading

## Spacing

- **Page padding**: 24px
- **Card padding**: 16px
- **Border radius**: 8px — slightly rounded, modern feel

## Component Guidelines

### Blocking Alert
- Background: danger color at low opacity
- Animation: gentle pulse to draw attention without being jarring
- Position: fixed top bar, above all content

### Code Blocks
- Theme: GitHub-style light theme
- Line numbers: enabled
- Font: monospace stack

### Mentor Canvas Surfaces
- Keep the canvas itself quiet: method scaffolds show title, guiding question, and whitespace.
- Expert attribution lives in metadata and the expert bar, not as extra on-canvas signature chips.
- Status badges and overlays must use icons or labels as well as color.

## Accessibility

- Maintain WCAG 2.1 AA contrast ratios
- All interactive elements must have focus indicators
- Color is not the sole indicator of status (use icons + text)
