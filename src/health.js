import http from 'http';
import { log } from './utils.js';

/**
 * Creates a simple HTTP server for health checks
 * Railway and other platforms can ping this endpoint
 * @param {number} port - Port to listen on
 * @returns {http.Server} HTTP server instance
 */
export function createHealthCheckServer(port) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') {
      res.writeHead(200, { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(JSON.stringify({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        service: 'dome-websocket-server',
      }));
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  });

  server.listen(port, '0.0.0.0', () => {
    log(`Health check server running on port ${port}`);
  });

  server.on('error', (error) => {
    log(`Health check server error: ${error.message}`, 'error');
  });

  return server;
}
