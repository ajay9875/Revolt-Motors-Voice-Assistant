const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware - FIXED for deployment
//const __dirname = path.resolve();
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Get API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

console.log('Using Gemini API Key:', GEMINI_API_KEY ? 'Present' : 'Missing');
// System instructions for Revolt Motors focus
const SYSTEM_INSTRUCTIONS = `You are "Rev", the voice assistant for Revolt Motors, an electric vehicle company. 
Your role is to assist users with information about Revolt Motors products, services, and initiatives.
Only discuss topics related to Revolt Motors, electric vehicles, and sustainable transportation.
If asked about unrelated topics, politely redirect the conversation back to Revolt Motors.
Be conversational, helpful, and enthusiastic about electric vehicles. Keep responses under 3 sentences.`;

// FIXED: Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Store audio files temporarily - FIXED for deployment
const upload = multer({ dest: uploadsDir });

// API endpoint to process audio with Gemini
app.post('/api/process-audio', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    // Read the audio file
    const audioFile = fs.readFileSync(req.file.path);
    const audioBase64 = audioFile.toString('base64');

    // Clean up the uploaded file immediately
    fs.unlinkSync(req.file.path);

    // Prepare the request for Gemini API
    const requestBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTIONS }]
      },
      contents: [{
        role: "user",
        parts: [{
          inline_data: {
            //mime_type: "audio/webm",
            mime_type: "audio/webm; codecs=opus",
            data: audioBase64
          }
        }]
      }],
      generation_config: {
        temperature: 0.7,
        max_output_tokens: 150
      }
    };

    // Call Gemini API
    const response = await axios.post(GEMINI_URL, requestBody, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    // Check if response has the expected structure
    if (!response.data || 
        !response.data.candidates || 
        !response.data.candidates[0] || 
        !response.data.candidates[0].content || 
        !response.data.candidates[0].content.parts) {
      throw new Error('Invalid response structure from Gemini API');
    }

    // Extract TEXT response from the first part
    const textContent = response.data.candidates[0].content.parts[0].text;

    if (!textContent) {
      throw new Error('No text content received from Gemini');
    }

    console.log('Gemini Response:', textContent);

    // Return text response to frontend
    res.json({
      success: true,
      text: textContent
    });

  } catch (error) {
    console.error('Error calling Gemini API:', error.response?.data || error.message);
    
    // Send appropriate error response to frontend
    if (error.response?.status === 429) {
      res.status(429).json({ 
        error: 'Rate limit exceeded. Please try again later.' 
      });
    } else if (error.response?.status === 404) {
      res.status(404).json({ 
        error: 'API model not found. Please check configuration.' 
      });
    } else if (error.response?.status === 400) {
      res.status(400).json({ 
        error: 'Invalid request. Please check your audio format.' 
      });
    } else {
      res.status(500).json({ 
        error: 'Failed to process audio: ' + (error.response?.data?.error?.message || error.message)
      });
    }
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});