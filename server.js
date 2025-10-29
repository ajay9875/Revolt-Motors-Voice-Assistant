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
// Switch to a model that handles Hindi + English
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

console.log('Using Gemini API Key:', GEMINI_API_KEY ? 'Present' : 'Missing');
console.log("Gemini URL:", GEMINI_URL);

// System instructions for Revolt Motors focus
const SYSTEM_INSTRUCTIONS = `
You are "Rev", the official voice assistant for Revolt Motors, India's leading electric vehicle company.

LANGUAGE RULES:
- Detect the user's language from their audio input and respond in the same language
- If the user speaks Hindi, respond in natural, conversational Hindi, using polite, female verbal forms (e.g., "aap," "sakti hun").
- If user speaks English, respond in English
- If user mixes Hindi and English, respond in the dominant language detected
- Avoid formal or robotic language; be friendly and engaging
- Use simple, clear sentences suitable for a wide audience
- Avoid technical jargon unless specifically asked
- Do not use slang or overly casual phrases
- For mixed language queries, respond in the dominant language detected

CORE RESPONSE GUIDELINES:
1. Focus exclusively on Revolt Motors products, services, initiatives, and electric vehicles
2. Be enthusiastic, helpful, and conversational
3. Keep responses concise (try to include all sentences)
4. After answering, always ask: "Would you like to know more about this?" (English) or "Kya aap is bare mein aur janna chahenge?" (Hindi)
5. Politely redirect unrelated questions back to Revolt Motors topics

EXAMPLE RESPONSES:
[For battery query]: "Revolt Motors bikes use advanced lithium-ion batteries with 150km range. Would you like details about charging options?"
[For pricing query]: "The RV400 starts at ₹1.25 lakhs ex-showroom. Should I explain the financing plans available?"
[For unrelated query]: "I specialize in Revolt Motors electric vehicles. What would you like to know about our bikes or services?"
`;

// FIXED: Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Store audio files temporarily - FIXED for deployment
const upload = multer({ dest: uploadsDir });

// helper function to keep only last 3 files
function maintainLastThreeFiles() {
  const files = fs.readdirSync(uploadsDir)
    .map(file => ({
      name: file,
      time: fs.statSync(path.join(uploadsDir, file)).mtime.getTime()
    }))
    .sort((a, b) => b.time - a.time); // newest first

  if (files.length > 3) {
    const oldFiles = files.slice(3); // beyond latest 3
    oldFiles.forEach(f => {
      fs.unlinkSync(path.join(uploadsDir, f.name));
      console.log(`Deleted old file: ${f.name}`);
    });
  }
}

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

    // keep only 3 latest uploads
    maintainLastThreeFiles();
    
    // Prepare the request for Gemini API
    const requestBody = {
      system_instruction: {
        parts: [{ text: SYSTEM_INSTRUCTIONS }]
      },
      contents: [{
        role: "user",
        parts: [{
          inline_data: {
            mime_type: "audio/webm",
            //mime_type: "audio/webm; codecs=opus",
            data: audioBase64
          }
        }]
      }],
      generation_config: {
        temperature: 0.7,
        max_output_tokens: 150,
        //language: "auto"
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