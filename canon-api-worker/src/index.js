/**
 * Quilt Distributed Coordinator — Cloudflare Worker
 * 
 * Endpoints:
 *   POST /api/node/register      — Register a node (returns node ID)
 *   GET  /api/node/:id           — Get node info
 *   POST /api/node/:id/heartbeat — Update node status
 *   POST /api/submit             — Submit training result
 *   GET  /api/leaderboard        — Top contributors
 *   WS   /api/session/:id        — Multiplayer session (WebSocket)
 *   POST /api/session/:id/event  — Append event to session feed
 *   GET  /api/session/:id        — Get session state
 *   GET  /api/canon/state        — Canon state
 *   POST /api/cell               — Submit cell to canon (existing)
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      // Node registry
      if (path === '/api/node/register' && request.method === 'POST') {
        const body = await request.json();
        const nodeId = 'node_' + crypto.randomUUID().slice(0, 8);
        const node = {
          id: nodeId,
          name: body.name || nodeId,
          hardware: body.hardware || {},
          firstSeen: new Date().toISOString(),
          lastHeartbeat: new Date().toISOString(),
          status: 'online',
          cells: 0,
          submissions: 0,
        };
        await env.NODES.put(`node:${nodeId}`, JSON.stringify(node), { expirationTtl: 86400 * 7 });
        return jsonResponse({ ok: true, nodeId, node }, corsHeaders);
      }
      
      // Heartbeat
      const heartbeatMatch = path.match(/^\/api\/node\/([^/]+)\/heartbeat$/);
      if (heartbeatMatch && request.method === 'POST') {
        const nodeId = heartbeatMatch[1];
        const body = await request.json();
        const existing = await env.NODES.get(`node:${nodeId}`);
        if (!existing) return jsonResponse({ ok: false, error: 'unknown node' }, corsHeaders, 404);
        
        const node = JSON.parse(existing);
        node.lastHeartbeat = new Date().toISOString();
        node.status = body.status || node.status;
        node.cells = body.cells || node.cells;
        node.hardware = body.hardware || node.hardware;
        await env.NODES.put(`node:${nodeId}`, JSON.stringify(node), { expirationTtl: 86400 * 7 });
        return jsonResponse({ ok: true, node }, corsHeaders);
      }
      
      // Get node
      const nodeMatch = path.match(/^\/api\/node\/([^/]+)$/);
      if (nodeMatch && request.method === 'GET') {
        const node = await env.NODES.get(`node:${nodeMatch[1]}`);
        if (!node) return jsonResponse({ ok: false, error: 'unknown' }, corsHeaders, 404);
        return jsonResponse({ ok: true, node: JSON.parse(node) }, corsHeaders);
      }
      
      // Submit training result
      if (path === '/api/submit' && request.method === 'POST') {
        const body = await request.json();
        const submissionId = 'sub_' + crypto.randomUUID().slice(0, 12);
        const submission = {
          id: submissionId,
          nodeId: body.nodeId,
          nodeName: body.nodeName,
          task: body.task,
          result: body.result,
          hardware: body.hardware,
          timestamp: new Date().toISOString(),
          canonReceipt: 'Q' + submissionId.slice(3).toUpperCase(),
        };
        await env.SUBMISSIONS.put(`sub:${submissionId}`, JSON.stringify(submission), { expirationTtl: 86400 * 30 });
        
        // Update node count
        const nodeKey = `node:${body.nodeId}`;
        const nodeData = await env.NODES.get(nodeKey);
        if (nodeData) {
          const node = JSON.parse(nodeData);
          node.submissions = (node.submissions || 0) + 1;
          await env.NODES.put(nodeKey, JSON.stringify(node), { expirationTtl: 86400 * 7 });
        }
        
        return jsonResponse({ ok: true, submissionId, submission }, corsHeaders);
      }
      
      // Leaderboard
      if (path === '/api/leaderboard' && request.method === 'GET') {
        const list = await env.NODES.list({ prefix: 'node:' });
        const board = [];
        for (const key of list.keys) {
          const data = await env.NODES.get(key.name);
          if (data) board.push(JSON.parse(data));
        }
        board.sort((a, b) => (b.submissions || 0) - (a.submissions || 0));
        return jsonResponse({ ok: true, board: board.slice(0, 50), count: board.length }, corsHeaders);
      }
      
      // Multiplayer session
      const sessionMatch = path.match(/^\/api\/session\/([^/]+)$/);
      if (sessionMatch && request.method === 'GET') {
        const sessionId = sessionMatch[1];
        const session = await env.SESSIONS.get(`session:${sessionId}`);
        if (!session) return jsonResponse({ ok: false, error: 'session not found' }, corsHeaders, 404);
        return jsonResponse({ ok: true, session: JSON.parse(session) }, corsHeaders);
      }
      
      const sessionEventMatch = path.match(/^\/api\/session\/([^/]+)\/event$/);
      if (sessionEventMatch && request.method === 'POST') {
        const sessionId = sessionEventMatch[1];
        const body = await request.json();
        const event = {
          ...body,
          id: 'evt_' + crypto.randomUUID().slice(0, 8),
          timestamp: new Date().toISOString(),
        };
        
        const sessionKey = `session:${sessionId}`;
        let session = await env.SESSIONS.get(sessionKey);
        session = session ? JSON.parse(session) : { id: sessionId, players: [], events: [] };
        session.events.unshift(event);
        if (session.events.length > 100) session.events = session.events.slice(0, 100);
        if (event.type === 'JOIN' && !session.players.find(p => p.id === event.playerId)) {
          session.players.push({
            id: event.playerId,
            name: event.playerName,
            locale: event.locale,
            joinedAt: new Date().toISOString(),
            witnesses: 0,
          });
        }
        await env.SESSIONS.put(sessionKey, JSON.stringify(session), { expirationTtl: 86400 * 7 });
        return jsonResponse({ ok: true, event }, corsHeaders);
      }
      
      // Session create
      if (path === '/api/session/create' && request.method === 'POST') {
        const sessionId = 'sess_' + crypto.randomUUID().slice(0, 12);
        const session = {
          id: sessionId,
          createdAt: new Date().toISOString(),
          players: [],
          events: [],
        };
        await env.SESSIONS.put(`session:${sessionId}`, JSON.stringify(session), { expirationTtl: 86400 * 7 });
        return jsonResponse({ ok: true, sessionId, session }, corsHeaders);
      }
      
      // WebSocket for live multiplayer
      if (path.startsWith('/api/ws/')) {
        if (request.headers.get('Upgrade') !== 'websocket') {
          return new Response('Expected WebSocket', { status: 400 });
        }
        const sessionId = path.slice(8);
        const pair = new WebSocketPair();
        const [client, server] = Object.values(pair);
        
        server.accept();
        server.addEventListener('message', async (msg) => {
          try {
            const data = JSON.parse(msg.data);
            
            // Echo to other clients in same session
            const sessionKey = `session:${sessionId}`;
            let session = await env.SESSIONS.get(sessionKey);
            session = session ? JSON.parse(session) : { id: sessionId, players: [], events: [] };
            
            session.events.unshift({ ...data, timestamp: new Date().toISOString() });
            if (session.events.length > 100) session.events = session.events.slice(0, 100);
            
            await env.SESSIONS.put(sessionKey, JSON.stringify(session), { expirationTtl: 86400 });
            
            // Echo
            server.send(JSON.stringify({ ok: true, echo: data, session }));
          } catch (e) {
            server.send(JSON.stringify({ ok: false, error: e.message }));
          }
        });
        
        return new Response(null, { status: 101, webSocket: client });
      }
      
      // Default: API info
      return jsonResponse({
        name: 'Quilt Distributed Coordinator',
        version: env.QUILT_VERSION || '1.0.0',
        endpoints: [
          'POST /api/node/register',
          'POST /api/node/:id/heartbeat',
          'GET /api/node/:id',
          'POST /api/submit',
          'GET /api/leaderboard',
          'POST /api/session/create',
          'GET /api/session/:id',
          'POST /api/session/:id/event',
          'WS /api/ws/:sessionId',
        ],
      }, corsHeaders);
      
    } catch (e) {
      return jsonResponse({ ok: false, error: e.message }, corsHeaders, 500);
    }
  },
};

function jsonResponse(obj, headers, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}
