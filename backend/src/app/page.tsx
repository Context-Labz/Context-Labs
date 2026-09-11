// This app is API + agent runtime only now — the UI moved to the browser
// extension in /extension. This page is just a human-readable health check.
export default function Home() {
  return (
    <main style={{ padding: 24, fontFamily: "sans-serif", maxWidth: 640 }}>
      <h1>Research Room — backend</h1>
      <p>This is the API and agent runtime. The workspace UI lives in the browser extension (see <code>/extension</code>) as a side panel.</p>
      <ul>
        <li><code>POST /api/workspace</code> — create a workspace</li>
        <li><code>GET /api/workspace?id=...</code> — fetch one</li>
        <li><code>POST /api/copilotkit</code> — CopilotKit chat runtime</li>
        <li><code>POST /api/research/start</code> — deterministic auto-run (no chat)</li>
        <li><code>POST /api/research/resolve-gap</code> — human-in-the-loop gap resolution</li>
        <li><code>POST /api/research/add-source</code> — capture a browser page as a source</li>
      </ul>
    </main>
  );
}
