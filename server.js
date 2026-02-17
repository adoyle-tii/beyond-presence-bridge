import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import WebSocket from 'ws';

const app = express();
app.use(express.json());

// Track active avatar sessions
const activeSessions = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        activeSessions: activeSessions.size,
        uptime: process.uptime()
    });
});

// Start avatar session endpoint (called by Cloudflare Worker)
app.post('/start-avatar', async (req, res) => {
    const { roomName, avatarId, sessionId } = req.body;
    
    console.log(`[Bridge] Starting avatar for room: ${roomName}`);
    
    if (!roomName || !avatarId) {
        return res.status(400).json({ error: 'Missing roomName or avatarId' });
    }
    
    if (activeSessions.has(roomName)) {
        console.log(`[Bridge] Session already active for room: ${roomName}`);
        return res.json({ status: 'already_active', roomName });
    }
    
    // Mark session as starting
    activeSessions.set(roomName, {
        avatarId,
        sessionId,
        status: 'starting',
        startedAt: new Date().toISOString()
    });
    
    // Respond immediately (don't wait for agent to fully connect)
    res.json({ 
        status: 'started', 
        roomName,
        sessionId
    });
    
    // Start avatar connection asynchronously
    startAvatarForRoom(roomName, avatarId, sessionId).catch(err => {
        console.error(`[Bridge] Failed to start avatar for ${roomName}:`, err);
        activeSessions.delete(roomName);
    });
});

// Stop avatar session endpoint (called when coaching session ends)
app.post('/stop-avatar', async (req, res) => {
    const { roomName } = req.body;
    
    if (!roomName) {
        return res.status(400).json({ error: 'Missing roomName' });
    }
    
    const session = activeSessions.get(roomName);
    if (!session) {
        return res.json({ status: 'not_found', roomName });
    }
    
    console.log(`[Bridge] Stopping avatar for room: ${roomName}`);
    
    // Clean up session
    activeSessions.delete(roomName);
    
    res.json({ status: 'stopped', roomName });
});

// Start Beyond Presence avatar for a specific room
async function startAvatarForRoom(roomName, avatarId, sessionId) {
    console.log(`[Bridge] Starting Beyond Presence avatar for room: ${roomName}`);
    
    const wsUrl = process.env.LIVEKIT_WS_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const beyondPresenceApiKey = process.env.BEYOND_PRESENCE_API_KEY;
    
    if (!wsUrl || !apiKey || !apiSecret || !beyondPresenceApiKey) {
        throw new Error('Missing required environment variables');
    }
    
    // Generate token for avatar participant
    const avatarIdentity = `avatar-${avatarId}`;
    const avatarToken = generateAvatarToken(roomName, avatarIdentity, apiKey, apiSecret);
    
    // Clean WebSocket URL (remove any query params)
    const cleanWsUrl = wsUrl.split('?')[0];
    
    console.log(`[Bridge] Creating Beyond Presence session with:`);
    console.log(`  - Avatar ID: ${avatarId}`);
    console.log(`  - Room: ${roomName}`);
    console.log(`  - LiveKit URL: ${cleanWsUrl}`);
    
    try {
        // Call Beyond Presence REST API to start avatar session
        const response = await fetch('https://api.bey.dev/v1/sessions', {
            method: 'POST',
            headers: {
                'x-api-key': beyondPresenceApiKey,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                avatar_id: avatarId,
                url: cleanWsUrl,
                token: avatarToken,
                livekit_room: roomName,
                auto_start: true,
                session_config: {
                    enable_audio_sync: true,
                    audio_source_participant_identity: null, // Will sync with any audio in the room
                    video_quality: 'high'
                }
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[Bridge] Beyond Presence API error (${response.status}):`, errorText);
            throw new Error(`Beyond Presence API error (${response.status}): ${errorText}`);
        }
        
        const avatarSession = await response.json();
        console.log(`[Bridge] ✅ Beyond Presence avatar session created:`, avatarSession.id);
        console.log(`[Bridge] Avatar status:`, avatarSession.status);
        
        // Update session
        const session = activeSessions.get(roomName);
        if (session) {
            session.avatarSession = avatarSession;
            session.status = 'avatar_active';
        }
        
        // Monitor avatar session (optional: poll for status updates)
        monitorAvatarSession(roomName, avatarSession.id, beyondPresenceApiKey);
        
        return avatarSession;
        
    } catch (error) {
        console.error(`[Bridge] Failed to start Beyond Presence avatar:`, error);
        activeSessions.delete(roomName);
        throw error;
    }
}

// Monitor avatar session status (optional)
async function monitorAvatarSession(roomName, sessionId, apiKey) {
    // Check status after 5 seconds
    setTimeout(async () => {
        try {
            const response = await fetch(`https://api.bey.dev/v1/sessions/${sessionId}`, {
                headers: {
                    'x-api-key': apiKey
                }
            });
            
            if (response.ok) {
                const status = await response.json();
                console.log(`[Bridge] Avatar session ${sessionId} status:`, status.status);
            }
        } catch (error) {
            console.error(`[Bridge] Failed to check avatar status:`, error.message);
        }
    }, 5000);
}

// Generate LiveKit token for avatar
function generateAvatarToken(roomName, identity, apiKey, apiSecret) {
    console.log(`[Bridge] Generating token for identity: ${identity}`);
    console.log(`[Bridge] API Key present: ${!!apiKey}, API Secret present: ${!!apiSecret}`);
    
    if (!apiKey || !apiSecret) {
        throw new Error('Missing LIVEKIT_API_KEY or LIVEKIT_API_SECRET');
    }
    
    const at = new AccessToken(apiKey, apiSecret, {
        identity: identity,
    });
    
    at.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
    });
    
    const jwt = at.toJwt();
    console.log(`[Bridge] Generated JWT token: ${jwt ? 'SUCCESS' : 'FAILED'}`);
    console.log(`[Bridge] Token length: ${jwt ? jwt.length : 0}`);
    console.log(`[Bridge] Token preview: ${jwt ? jwt.substring(0, 50) + '...' : 'null'}`);
    
    return jwt;
}

// Start HTTP server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Bridge] 🚀 Server running on port ${PORT}`);
    console.log(`[Bridge] Environment check:`);
    console.log(`  - LIVEKIT_WS_URL: ${process.env.LIVEKIT_WS_URL ? '✓' : '✗'}`);
    console.log(`  - LIVEKIT_API_KEY: ${process.env.LIVEKIT_API_KEY ? '✓' : '✗'}`);
    console.log(`  - LIVEKIT_API_SECRET: ${process.env.LIVEKIT_API_SECRET ? '✓' : '✗'}`);
    console.log(`  - BEYOND_PRESENCE_API_KEY: ${process.env.BEYOND_PRESENCE_API_KEY ? '✓' : '✗'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Bridge] Shutting down gracefully...');
    
    // Clear all active sessions
    activeSessions.clear();
    
    process.exit(0);
});
