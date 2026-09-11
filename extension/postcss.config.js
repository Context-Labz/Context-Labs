// Vite runs every CSS file that passes through its pipeline (including ones
// imported from node_modules, like @copilotkit/react-core/v2/styles.css)
// through this same postcss config. CopilotKit's bundled CSS uses `@layer
// base` in its own right (a real CSS feature) without a `@tailwind base`
// in that same file, which trips Tailwind's plugin into an error — it
// isn't a bug in their CSS, just a conflict with applying Tailwind
// globally. Scope Tailwind to only our own /src files; everything else
// (third-party CSS) only gets autoprefixer.
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

export default (ctx) => {
  const isOwnSource = typeof ctx.file === "string" && ctx.file.includes("/src/");
  return {
    plugins: isOwnSource ? [tailwindcss, autoprefixer] : [autoprefixer],
  };
};
