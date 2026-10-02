import fs from "node:fs";
import http from "node:http";
import https from "node:https";
// This gateway is an isolated container. It neither reads production files nor binds production ports.
function route(url) {
  if (/^\/backend\/(?:game|cluster|matchmaking)(?:\/|$)/.test(url)) return null;
  if (/^\/(?:w\d+\/)?api\/(?:admin|admin-bot|adminbot)(?:\/|$)/.test(url))
    return null;
  if (url.split("?")[0] === "/api/create_game")
    return { hostname: "game", port: 3001, path: url };
  if (url.startsWith("/backend/"))
    return { hostname: "api", port: 8787, path: url.slice(8) };
  if (url === "/w0" || url.startsWith("/w0/"))
    return { hostname: "game", port: 3001, path: url.slice(3) || "/" };
  return { hostname: "game", port: 3000, path: url };
}
const server = https.createServer(
  {
    key: fs.readFileSync("/certs/live/game.exudizmono.com/privkey.pem"),
    cert: fs.readFileSync("/certs/live/game.exudizmono.com/fullchain.pem"),
  },
  (req, res) => {
    const staticFiles = {
      "/stats/": ["stats.html", "text/html"],
      "/stats/style.css": ["stats-style.css", "text/css"],
      "/stats/app.js": ["stats-app.js", "text/javascript"],
      "/clans/": ["clans.html", "text/html"],
      "/clans/app.js": ["clans-app.js", "text/javascript"],
      "/credits/": ["credits.html", "text/html"],
    };
    const file = staticFiles[req.url.split("?")[0]];
    if (file && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": file[1],
        "Cache-Control": "no-store",
      });
      res.end(fs.readFileSync("/preview-public/" + file[0]));
      return;
    }
    if (req.url === "/source.tar.gz") {
      res.writeHead(302, {
        Location: "https://github.com/Moonnooo/OpenFrontIO",
      });
      res.end();
      return;
    }
    const target = route(req.url);
    if (!target) {
      res.writeHead(403);
      res.end();
      return;
    }
    const proxy = http.request(
      {
        ...target,
        method: req.method,
        headers: {
          ...req.headers,
          "x-forwarded-for": req.socket.remoteAddress,
        },
      },
      (up) => {
        res.writeHead(up.statusCode, up.headers);
        up.pipe(res);
      },
    );
    proxy.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end("Test server starting");
    });
    req.pipe(proxy);
  },
);
server.on("upgrade", (req, socket, head) => {
  const target = route(req.url);
  if (!target) {
    socket.destroy();
    return;
  }
  const proxy = http.request({ ...target, headers: req.headers });
  proxy.on("upgrade", (res, upstream, uphead) => {
    socket.write(
      `HTTP/1.1 ${res.statusCode} ${res.statusMessage}\r\n` +
        Object.entries(res.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (uphead.length) socket.write(uphead);
    if (head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });
  proxy.on("error", () => socket.destroy());
  proxy.end();
});
server.listen(8080, "0.0.0.0");
