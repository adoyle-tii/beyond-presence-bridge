import express from 'express';
import { Room, RoomEvent, Track } from 'livekit-client';
import { AccessToken } from 'livekit-server-sdk';

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
    
    // Start agent connection asynchronously
    startAgentForRoom(roomName, avatarId, sessionId).catch(err => {
        console.error(`[Bridge] Failed to start agent for ${roomName}:`, err);
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
    if (session.room) {
        await session.room.disconnect();
    }
    
    activeSessions.delete(roomName);
    
    res.json({ status: 'stopped', roomName });
});

// Start LiveKit agent for a specific room
async function startAgentForRoom(roomName, avatarId, sessionId) {
    console.log(`[Bridge] Connecting agent to room: ${roomName}`);
    
    const wsUrl = process.env.LIVEKIT_WS_URL;
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const beyondPresenceApiKey = process.env.BEYOND_PRESENCE_API_KEY;
    
    if (!wsUrl || !apiKey || !apiSecret || !beyondPresenceApiKey) {
        throw new Error('Missing required environment variables');
    }
    
    // Generate token for agent participant
    const agentIdentity = `bridge-agent-${sessionId}`;
    const token = generateAgentToken(roomName, agentIdentity, apiKey, apiSecret);
    
    // Create LiveKit room connection
    const room = new Room();
    
    try {
        // Connect to room
        await room.connect(wsUrl, token);
        console.log(`[Bridge] Agent connected to room: ${roomName}`);
        
        // Update session
        const session = activeSessions.get(roomName);
        if (session) {
            session.room = room;
            session.status = 'connected';
        }
        
        // Subscribe to coach audio track from browser client
        room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
            console.log(`[Bridge] Track subscribed: ${track.kind} from ${participant.identity}`);
            
            // Look for coach audio from the seller client
            if (track.kind === Track.Kind.Audio && 
                publication.name === 'coach-voice' && 
                participant.identity.startsWith('seller-')) {
                
                console.log(`[Bridge] Found coach audio track, starting Beyond Presence avatar`);
                
                try {
                    // Call Beyond Presence REST API to start avatar session
                    const avatarSession = await startBeyondPresenceAvatar(
                        roomName,
                        avatarId,
                        wsUrl,
                        apiKey,
                        apiSecret,
                        beyondPresenceApiKey
                    );
                    
                    console.log(`[Bridge] Beyond Presence avatar started:`, avatarSession.id);
                    
                    if (session) {
                        session.avatarSession = avatarSession;
                        session.status = 'avatar_active';
                    }
                    
                } catch (error) {
                    console.error(`[Bridge] Failed to start Beyond Presence avatar:`, error);
                }
            }
        });
        
        // Handle disconnection
        room.on(RoomEvent.Disconnected, () => {
            console.log(`[Bridge] Room disconnected: ${roomName}`);
            activeSessions.delete(roomName);
        });
        
        // Handle participant disconnect (clean up if seller leaves)
        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
            if (participant.identity.startsWith('seller-')) {
                console.log(`[Bridge] Seller left, cleaning up room: ${roomName}`);
                room.disconnect();
                activeSessions.delete(roomName);
            }
        });
        
    } catch (error) {
        console.error(`[Bridge] Failed to connect to LiveKit room:`, error);
        activeSessions.delete(roomName);
        throw error;
    }
}

// Start Beyond Presence avatar using REST API
async function startBeyondPresenceAvatar(roomName, avatarId, livekitWsUrl, livekitApiKey, livekitApiSecret, beyondPresenceApiKey) {
    // Generate token for avatar
    const avatarIdentity = `avatar-${avatarId}`;
    const avatarToken = generateAgentToken(roomName, avatarIdentity, livekitApiKey, livekitApiSecret);
    
    // Clean WebSocket URL
    const cleanWsUrl = livekitWsUrl.split('?')[0];
    
    console.log(`[Bridge] Creating Beyond Presence session for avatar: ${avatarId}`);
    
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
                enable_audio_sync: true
            }
        })
    });
    
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Beyond Presence API error (${response.status}): ${errorText}`);
    }
    
    const sessionData = await response.json();
    console.log(`[Bridge] Beyond Presence session created:`, sessionData.id);
    
    return sessionData;
}

// Generate LiveKit token
function generateAgentToken(roomName, identity, apiKey, apiSecret) {
    const token = new AccessToken(apiKey, apiSecret, {
        identity: identity,
        ttl: '2h'
    });
    
    token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        hidden: false
    });
    
    return token.toJwt();
}

// Start HTTP server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Bridge] Server running on port ${PORT}`);
    console.log(`[Bridge] Environment check:`);
    console.log(`  - LIVEKIT_WS_URL: ${process.env.LIVEKIT_WS_URL ? '✓' : '✗'}`);
    console.log(`  - LIVEKIT_API_KEY: ${process.env.LIVEKIT_API_KEY ? '✓' : '✗'}`);
    console.log(`  - LIVEKIT_API_SECRET: ${process.env.LIVEKIT_API_SECRET ? '✓' : '✗'}`);
    console.log(`  - BEYOND_PRESENCE_API_KEY: ${process.env.BEYOND_PRESENCE_API_KEY ? '✓' : '✗'}`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('[Bridge] Shutting down gracefully...');
    
    // Disconnect all active sessions
    for (const [roomName, session] of activeSessions.entries()) {
        console.log(`[Bridge] Cleaning up room: ${roomName}`);
        if (session.room) {
            await session.room.disconnect();
        }
    }
    
    process.exit(0);
});
