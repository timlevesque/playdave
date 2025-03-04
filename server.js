// server.js
require('dotenv').config();
const express = require('express');
const fetch = require('node-fetch');
const path = require('path');
const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 3030 });

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        // Broadcast the message to all clients
        wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(message);
            }
        });
    });

    ws.send(JSON.stringify({ message: 'Welcome to the WebSocket server!' }));
});

console.log('WebSocket server is running on ws://localhost:3030');


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files
app.use(express.static('public'));




// API Route to handle OpenAI requests
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;
  const apiKey = process.env.OPENAI_API_KEY;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages,
        temperature: 1,
        max_tokens: 300,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    res.status(500).json({ error: 'Failed to connect to OpenAI API' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
