# TrustTrade Design Guidelines

## Color Palette

### Primary Colors
- **Primary (Dark Navy)**: `#1a2942` - Used for navbar, headings, primary buttons
- **Green (Success)**: `#2ecc71` - Used for success states, positive actions, completed status
- **Error (Red)**: `#e74c3c` - Used for errors, destructive actions, disputed/refunded status
- **Warning (Orange)**: `#f39c12` - Used for warnings, pending states, awaiting payment

### Neutral Colors
- **Background**: `#ffffff` - Main page background
- **Section Background**: `#f8f9fa` - Cards, panels, sections
- **Text (Primary)**: `#212529` - Main text, headings
- **Text (Secondary/Subtext)**: `#6c757d` - Labels, helper text, secondary content
- **Border**: `#dee2e6` - Card borders, dividers, input borders

### Status Badge Colors
| Status | Color | Hex |
|--------|-------|-----|
| Awaiting Payment | Orange | `#f39c12` |
| Pending | Grey | `#6c757d` |
| Active / Paid | Blue | `#3498db` |
| Completed / Released | Green | `#2ecc71` |
| Disputed / Refunded | Red | `#e74c3c` |

## CSS Variables

```css
:root {
  --primary: #1a2942;
  --green: #2ecc71;
  --background: #ffffff;
  --section: #f8f9fa;
  --text: #212529;
  --subtext: #6c757d;
  --border: #dee2e6;
  --error: #e74c3c;
  --warning: #f39c12;
  --info: #3498db;
}
```

## Typography
- **Headings**: Manrope font family
- **Body**: Inter font family  
- **Code/Mono**: JetBrains Mono

## Component Guidelines

### Buttons
- Primary: Dark navy background (#1a2942), white text
- Success: Green background (#2ecc71), white text
- Danger: Red background (#e74c3c), white text
- Warning: Orange background (#f39c12), white text

### Cards
- Background: White (#ffffff)
- Border: 1px solid #dee2e6
- Border radius: 0.75rem (12px)
- Shadow: Subtle shadow on hover

### Admin Navbar
- Background: Dark navy (#1a2942)
- Text: White, with 80% opacity for secondary links
- Logo: White TrustTrade text, bold

### Breadcrumbs
- Separator: ChevronRight icon
- Inactive links: #6c757d with hover underline
- Active/current: #212529

## Status Badges
All badges should have:
- Padding: px-3 py-1
- Border radius: rounded-full or rounded
- Font size: text-xs or text-sm
- White text on colored backgrounds
