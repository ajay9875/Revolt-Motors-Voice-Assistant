class VoiceChat {
    constructor() {
        this.isListening = false;
        this.isProcessing = false;
        this.isSpeaking = false;
        this.mediaRecorder = null;
        this.audioChunks = [];
        
        this.initializeElements();
        this.setupEventListeners();
    }

    initializeElements() {
        this.micBtn = document.getElementById('mic-btn');
        this.stopBtn = document.getElementById('stop-btn');
        this.statusIndicator = document.getElementById('status-indicator');
        this.statusText = document.getElementById('status-text');
        this.chatMessages = document.getElementById('chat-messages');
        this.responseAudio = document.getElementById('response-audio');
    }

    setupEventListeners() {
        this.micBtn.addEventListener('click', () => this.toggleListening());
        this.stopBtn.addEventListener('click', () => this.stopAll());
        
        this.responseAudio.addEventListener('play', () => {
            this.setSpeakingState(true);
        });
        
        this.responseAudio.addEventListener('ended', () => {
            this.setSpeakingState(false);
        });

        this.responseAudio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            this.addMessage('system', 'Error playing audio response.');
            this.setSpeakingState(false);
        });
    }

    toggleListening() {
        if (this.isListening) {
            this.stopListening();
        } else {
            this.startListening();
        }
    }

    async startListening() {
        try {
            this.setListeningState(true);
            //this.addMessage('system', 'Listening... Speak now');
            
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    sampleSize: 16
                }
            });
            
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                await this.sendAudioToServer(audioBlob);
            };
            
            this.mediaRecorder.start(1000);
            
        } catch (error) {
            console.error('Error accessing microphone:', error);
            this.addMessage('system', 'Microphone access denied or unavailable');
            this.setListeningState(false);
        }
    }

    stopListening() {
        if (this.mediaRecorder && this.isListening) {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
            this.setListeningState(false);
            //this.addMessage('system', 'Processing your request...');
        }
    }

    stopAll() {
        // Stop listening if active
        if (this.isListening) {
            this.stopListening();
            this.addMessage('system', 'You stopped the listening');
        }
        
        // Stop processing if active - we can't actually stop a fetch request
        // but we can handle the response appropriately
        if (this.isProcessing) {
            this.addMessage('system', 'You cancelled the processing');
            this.setProcessingState(false);
        }
        
        // Stop speaking if active
        if (this.isSpeaking) {
            // Stop text-to-speech
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
            }
            
            // Stop audio playback if any
            this.responseAudio.pause();
            this.responseAudio.currentTime = 0;
            
            this.setSpeakingState(false);
            //this.addMessage('system', 'Stop All button pressed');
        }
    }

    async sendAudioToServer(audioBlob) {
        this.setProcessingState(true);
        
        try {
            const formData = new FormData();
            formData.append('audio', audioBlob, 'recording.webm');
            
            const response = await fetch('/api/process-audio', {
                method: 'POST',
                body: formData
            });
            
            // Check if HTTP response is OK first
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const data = await response.json();
            
            // Handle the response
            this.handleAudioResponse(data);
            
        } catch (error) {
            console.error('Error sending audio to server:', error);
            this.addMessage('system', error.message || 'Error processing audio. Please try again.');
            this.setProcessingState(false);
        }
    }

    handleAudioResponse(data) {
        // === COMPREHENSIVE ERROR CHECKING ===
        if (!data) {
            console.error('No data received from server');
            this.addMessage('system', 'No response from server. Please try again.');
            this.setProcessingState(false);
            return;
        }

        if (data.error) {
            console.error('Server returned error:', data.error);
            this.addMessage('system', data.error || 'Server error occurred.');
            this.setProcessingState(false);
            return;
        }

        if (!data.text) {
            console.error('No text data in response:', data);
            this.addMessage('system', 'Received invalid response from server.');
            this.setProcessingState(false);
            return;
        }

        // === IF ALL CHECKS PASS ===
        this.addMessage('ai', data.text);
        this.speakText(data.text);
        this.setProcessingState(false);
    }

speakText(text) {
    if ('speechSynthesis' in window) {
        try {
            speechSynthesis.cancel(); // stop any ongoing speech

            const utterance = new SpeechSynthesisUtterance(text);

            // Voice settings for female Indian English characteristics
            utterance.rate = 0.95;   // natural speaking pace
            utterance.pitch = 1.1;   // slightly higher pitch for female voice
            utterance.volume = 1.0;

            // Get available voices
            let voices = speechSynthesis.getVoices();
            
            // If voices aren't loaded yet, wait for them
            if (!voices.length) {
                return new Promise(resolve => {
                    speechSynthesis.onvoiceschanged = () => {
                        voices = speechSynthesis.getVoices();
                        this.speakWithFemaleVoice(text, voices);
                        resolve();
                    };
                });
            }

            this.speakWithFemaleVoice(text, voices);

        } catch (error) {
            console.error("Error in text-to-speech:", error);
            this.setProcessingState(false);
        }
    } else {
        this.addMessage("system", "Text-to-speech not supported in this browser.");
        this.setProcessingState(false);
    }
}

// New helper method for female voice selection
speakWithFemaleVoice(text, voices) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 1.1;
    utterance.volume = 1.0;

    // Detect language
    const isHindi = /[\u0900-\u097F]/.test(text);
    
    // Female voice patterns to look for in voice names
    const femaleVoicePatterns = [
        'female', 'feminine', 'woman', 'veena', 'samantha', 'karen', 
        'lekha', 'neelam', 'google uk female', 'microsoft zira'
    ];

    // Language-specific voice preferences
    const languageCode = isHindi ? 'hi' : 'en';
    
    // Find the best female voice
    let selectedVoice = this.findFemaleVoice(voices, languageCode, femaleVoicePatterns);

    if (selectedVoice) {
        utterance.voice = selectedVoice;
        utterance.lang = selectedVoice.lang; // Set the exact language
        console.log("🎙 Using female voice:", selectedVoice.name, selectedVoice.lang);
    } else {
        // Fallback: any voice for the correct language
        selectedVoice = voices.find(v => v.lang.includes(languageCode));
        if (selectedVoice) {
            utterance.voice = selectedVoice;
            utterance.lang = selectedVoice.lang;
            console.warn("⚠️ No specific female voice found, using:", selectedVoice.name);
        } else {
            console.warn("⚠️ No suitable voice found, using default");
        }
    }

    // Event handlers
    utterance.onstart = () => this.setSpeakingState(true);
    utterance.onend = () => this.setSpeakingState(false);
    utterance.onerror = (event) => {
        console.error("Speech synthesis error:", event);
        this.setSpeakingState(false);
        this.addMessage("system", "You stopped the response.");
    };

    // Speak now
    speechSynthesis.speak(utterance);
}

// Helper function to find female voices
findFemaleVoice(voices, languageCode, femalePatterns) {
    // First priority: Exact female matches for the language
    for (const voice of voices) {
        if (voice.lang.includes(languageCode)) {
            const voiceName = voice.name.toLowerCase();
            if (femalePatterns.some(pattern => voiceName.includes(pattern))) {
                return voice;
            }
        }
    }
    
    // Second priority: Any voice for the language with higher pitch potential
    for (const voice of voices) {
        if (voice.lang.includes(languageCode)) {
            const voiceName = voice.name.toLowerCase();
            // Avoid obviously male identifiers
            if (!voiceName.includes('male') && 
                !voiceName.includes('man') && 
                !voiceName.includes('david') && 
                !voiceName.includes('thomas') &&
                !voiceName.includes('deep') &&
                !voiceName.includes('microsoft david')) {
                return voice;
            }
        }
    }
    
    return null;
}

addMessage(sender, text) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    
    const timestamp = new Date().toLocaleTimeString();
    messageDiv.innerHTML = `
        <div>${text}</div>
        <span class="timestamp">${timestamp}</span>
    `;
    
    this.chatMessages.appendChild(messageDiv);
    this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
}

setListeningState(listening) {
    this.isListening = listening;
    
    if (listening) {
        this.micBtn.innerHTML = '<span class="icon"><i class="fas fa-microphone"></i></span>';
        this.micBtn.classList.add('listening');
        this.updateStatus('listening', 'Listening...');
    } 
    else {
        this.micBtn.innerHTML = '<span class="icon"><i class="fas fa-microphone-slash"></i></span>';
        this.micBtn.classList.remove('listening');
    }
    
    this.stopBtn.disabled = !(this.isListening || this.isProcessing || this.isSpeaking);
}

setProcessingState(processing) {
    this.isProcessing = processing;
    
    if (processing) {
        this.updateStatus('processing', 'Processing...');
    } else if (!this.isListening && !this.isSpeaking) {
        this.updateStatus('connected', 'Ready');
    }
    
    this.stopBtn.disabled = !(this.isListening || this.isProcessing || this.isSpeaking);
}

setSpeakingState(speaking) {
    this.isSpeaking = speaking;
    
    if (speaking) {
        this.updateStatus('speaking', 'AI is speaking');
    } else if (!this.isListening && !this.isProcessing) {
        this.updateStatus('connected', 'Ready');
    }
    
    this.stopBtn.disabled = !(this.isListening || this.isProcessing || this.isSpeaking);
}

updateStatus(state, text) {
    this.statusIndicator.className = 'status-indicator';
    if (state !== 'connected') {
        this.statusIndicator.classList.add(state);
    }
    this.statusText.textContent = text;
  }
}

// Initialize the voice chat when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new VoiceChat();
});