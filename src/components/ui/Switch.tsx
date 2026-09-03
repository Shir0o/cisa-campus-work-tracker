import { cn } from '../../lib/utils';

// A two-state toggle that reads as a switch to assistive tech and at a glance.
// Three pieces of intent the field has been missing:
//   1. `role="switch"` + `aria-checked` so screen readers announce the state.
//   2. A visible "On" / "Off" label inside the track so sighted users don't
//      have to parse a colour change under the Ink palette, where the
//      on/off tracks have similar dark neutrals.
//   3. An off-track colour (`bg-outline-variant`) that survives the dark
//      theme, where the old `bg-outline` swatch melted into `bg-primary`.
export function Switch({
  checked,
  onChange,
  disabled,
  className,
  ...rest
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  className?: string;
  // Pass-through for `aria-label` (and any other DOM prop the call site needs).
  // Rest props are spread onto the underlying button — keep the `aria-label`
  // requirement explicit so the type checker enforces it.
  ['aria-label']: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      {...rest}
      className={cn(
        // Track: relative for the absolute-positioned knob, and shrink-0 so the
        // switch doesn't get hugged by flex parents in label rows.
        'relative inline-flex items-center h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer',
        // The on-track uses `bg-primary` to match the existing affordance
        // (Settings.tsx previously used `bg-accent`; bringing all three sites
        // onto one signal). Off-track uses `bg-outline-variant`, not the bare
        // `bg-outline`, so the dark theme keeps contrast.
        checked ? 'bg-primary' : 'bg-outline-variant',
        // Disabled: drop the pointer, dim, but keep the state readable.
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      {/* Visible state label — only the active label is rendered so the
          intent ("On" / "Off") is unambiguous without the knob covering one.
          `pointer-events-none` keeps clicks on the track itself. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 flex items-center text-[9px] font-semibold uppercase tracking-wide select-none',
          checked
            ? 'left-1.5 text-on-primary'
            : 'right-1.5 text-on-surface-variant',
        )}
      >
        {checked ? 'On' : 'Off'}
      </span>
      {/* Knob. Translate by the track width minus the knob minus the gap. */}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  );
}