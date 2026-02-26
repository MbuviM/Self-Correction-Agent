import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (data) => {
    const { type, prompt } = JSON.parse(data.toString());

    if (type === 'start_analysis') {
      // Thinking
      ws.send(JSON.stringify({ type: 'status', stage: 'thinking' }));
      await new Promise(r => setTimeout(r, 1000)); 

      // Verifying/Correcting 
      ws.send(JSON.stringify({ type: 'status', stage: 'correcting' }));
      
      // Final Output
      ws.send(JSON.stringify({ 
        type: 'final', 
        content: "Backend processed successfully. Placeholder for AI result.",
        justification: "Logic verified by user-defined constraints."
      }));
    }
  });
});