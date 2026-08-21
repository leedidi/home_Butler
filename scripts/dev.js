import { createServer } from "vite";
import "../server/index.js";

const viteServer = await createServer({
  server: { host: "127.0.0.1" },
});
await viteServer.listen();
viteServer.printUrls();
