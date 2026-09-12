// Do NOT gate Tailwind behind `ctx.file` here. Vite calls this factory ONCE
// with no file context, so any such test is always false and Tailwind silently
// never runs: `@layer components { … }` is valid plain CSS and keeps working,
// while `@tailwind base/components/utilities` ships through unexpanded and not
// one utility (flex, gap-3, px-4) reaches the browser. The tell is `@tailwind`
// appearing literally in the built bundle.
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default {
  plugins: [tailwindcss, autoprefixer],
};
