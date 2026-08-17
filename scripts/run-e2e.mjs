import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import next from "next";

const hostname = "127.0.0.1";
const port = Number(process.env.E2E_PORT ?? "3000");
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, hostname);
  });
}

function closeServer(server, sockets) {
  return new Promise((resolve, reject) => {
    const finish = (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    };

    if (server?.listening) {
      server.close(finish);
      server.closeAllConnections();
    } else {
      finish();
    }

    for (const socket of sockets) {
      socket.destroy();
    }
  });
}

function runPlaywright() {
  const require = createRequire(import.meta.url);
  const playwrightPackage = require.resolve("@playwright/test/package.json");
  const playwrightCli = path.join(path.dirname(playwrightPackage), "cli.js");
  const playwrightArguments = [playwrightCli, "test"];
  if (process.env.E2E_PLAYWRIGHT_CONFIG) {
    playwrightArguments.push("--config", process.env.E2E_PLAYWRIGHT_CONFIG);
  }

  const child = spawn(process.execPath, playwrightArguments, {
    cwd: projectRoot,
    env: {
      ...process.env,
      E2E_LIFECYCLE_MANAGED_SERVER: "1",
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright exited from signal ${signal}`));
        return;
      }

      resolve(code ?? 1);
    });
  });
}

const app = next({
  dev: true,
  dir: projectRoot,
  hostname,
  port,
  turbopack: true,
});
let server;
const sockets = new Set();

try {
  await app.prepare();

  const handleRequest = app.getRequestHandler();
  server = createServer((request, response) => {
    handleRequest(request, response).catch((error) => {
      console.error(error);
      response.statusCode = 500;
      response.end("Internal Server Error");
    });
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });
  server.on("upgrade", app.getUpgradeHandler());

  await listen(server);
  process.exitCode = await runPlaywright();
} finally {
  await closeServer(server, sockets);
  await app.close();
}

process.exit(process.exitCode ?? 1);
