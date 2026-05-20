// Agrivia — backend API + WebSocket (déployé sur Render).
// Point d'entrée mince : crée le serveur puis ouvre le port.
// Toute la logique vit dans server.js + lib/*.
const { createServer } = require("./server");

const PORT = process.env.PORT || process.env.WS_PORT || 3000;

const app = createServer();

app.start(PORT).then(({ port }) => {
  console.log(`[Backend] Démarré sur le port ${port}`);
  console.log(`[Backend] WebSocket gateway  : ws://localhost:${port}/ws`);
  console.log(`[Backend] WebSocket frontend : ws://localhost:${port}`);
  console.log(`[Backend] Autopilote         : GET/POST http://localhost:${port}/api/autopilot`);
  console.log(`[Backend] Seuils             : POST http://localhost:${port}/api/thresholds`);
  console.log(`[Backend] Historique         : GET  http://localhost:${port}/api/history`);
});
