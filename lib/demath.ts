/**
 * Makes LaTeX readable without shipping a maths typesetter.
 *
 * The prompt asks models not to use it, and mostly they don't — but "explain
 * eigenvalues" reliably produces `$$A \vec{v} = \lambda \vec{v}$$`, and a
 * Linear Algebra student seeing that raw is the worst case for this feature.
 * Unwrapping the delimiters and mapping the handful of symbols that actually
 * come up gets to "A v = λ v", which reads fine. A real renderer would be
 * better and is not worth the weight.
 */
export const SYMBOLS: Record<string, string> = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ",
  mu: "μ", pi: "π", sigma: "σ", phi: "φ", omega: "ω", Delta: "Δ", Sigma: "Σ",
  times: "×", cdot: "·", pm: "±", div: "÷", neq: "≠", ne: "≠", leq: "≤",
  le: "≤", geq: "≥", ge: "≥", approx: "≈", equiv: "≡", infty: "∞",
  rightarrow: "→", to: "→", Rightarrow: "⇒", in: "∈", subset: "⊂",
  forall: "∀", exists: "∃", partial: "∂", nabla: "∇", int: "∫", sum: "Σ",
  prod: "Π", ldots: "…", dots: "…",
};

export function demath(s: string): string {
  return (
    s
      // $$block$$ and \[block\] and $inline$ and \(inline\) — keep the inside.
      .replace(/\$\$([\s\S]+?)\$\$/g, "$1")
      .replace(/\\\[([\s\S]+?)\\\]/g, "$1")
      .replace(/\$([^$\n]+?)\$/g, "$1")
      .replace(/\\\(([\s\S]+?)\\\)/g, "$1")
      // \frac{a}{b} → a/b, \sqrt{x} → √x, \vec{v}/\mathbf{v}/\text{x} → contents.
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1/$2")
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, "√$1")
      .replace(/\\(?:vec|mathbf|mathrm|text|operatorname)\s*\{([^{}]*)\}/g, "$1")
      // Named symbols, then any command we don't know (\det, \sin) minus its slash.
      .replace(/\\([a-zA-Z]+)/g, (whole, name: string) => SYMBOLS[name] ?? name)
      .replace(/\\[,;:!\s]/g, " ")
  );
}
