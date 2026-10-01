// Small, muted "PKR" label. Use ONCE next to a grand total (or in a summary header),
// never on every figure in a table - tables put "(PKR)" in the column header instead.
export default function CurrencyTag({ size = 11 }: { size?: number }) {
  return (
    <span style={{ fontSize: size, fontWeight: 600, color: "var(--text-muted)", letterSpacing: 0.4, marginRight: 5 }}>PKR</span>
  )
}
