// FIX: this config used to gate Tailwind behind `ctx.file.includes("/src/")`,
// intending to run it on our own CSS but not on CopilotKit's bundled
// stylesheet. Vite calls this factory ONCE with no file context — `ctx.file` is
// `undefined` — so the test was always false and Tailwind never ran at all.
//
// The symptom hid in plain sight: `@layer components { … }` is valid plain CSS,
// so every hand-written class in styles.css kept working, while
// `@tailwind base/components/utilities` passed through unexpanded and not one
// utility (flex, gap-3, px-4, truncate) reached the browser. The panel had been
// laying out with browser defaults the whole time. The giveaway was `@tailwind`
// appearing literally in the shipped bundle.
//
// Tailwind now runs globally, which is what it expects. The conflict that
// motivated the original gate is real, though: CopilotKit's CSS uses `@layer
// base` without a `@tailwind base` of its own, and Tailwind treats that as an
// error. Per-file context IS available inside a postcss plugin (unlike in this
// factory), so the plugin below unwraps cascade layers in third-party CSS
// before Tailwind sees them. Their rules keep their relative order — only the
// layer grouping goes — and the file is scoped to [data-copilotkit], so nothing
// in our panel is affected.
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

// Declared as a plugin FACTORY, not a plugin object: Vite's postcss config
// loader calls every entry in `plugins`, so handing it a plain object fails
// with "plugin is not a function".
const unwrapForeignLayers = () => ({
  postcssPlugin: "unwrap-foreign-layers",
  Once(root, { result }) {
    const from = String(result.opts.from || "").split("\\").join("/");
    if (from.includes("/src/")) return; // our own CSS keeps its layers
    root.walkAtRules("layer", (rule) => {
      if (rule.nodes) rule.replaceWith(rule.nodes);
      else rule.remove(); // bare `@layer a, b;` ordering statements
    });
  },
});
unwrapForeignLayers.postcss = true;

export default {
  plugins: [unwrapForeignLayers, tailwindcss, autoprefixer],
};
