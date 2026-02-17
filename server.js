import express from 'express';
import { defineAgent, cli, WorkerOptions } from '@livekit/agents';
import { AvatarSession } from '@livekit/agents-plugin-bey';
import { Room, RoomEvent, Track } from 'livekit-client';

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
    
    // Create LiveKit room connection
    const room = new Room();
    
    // Generate token for agent participant
    const token = await generateAgentToken(roomName, `bridge-agent-${sessionId}`, apiKey, apiSecret);
    
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
                // Initialize Beyond Presence avatar
                const avatar = new AvatarSession(avatarId, beyondPresenceApiKey);
                
                // Create agent context (simplified version)
                const agentContext = {
                    room: room,
                    agent: {
                        // Minimal agent interface for avatar
                        publish: async (audioTrack) => {
                            return await room.localParticipant.publishTrack(audioTrack);
                        }
                    }
                };
                
                // Start avatar (it will automatically subscribe to audio in the room)
                await avatar.start(agentContext.agent, room);
                
                console.log(`[Bridge] Beyond Presence avatar started successfully`);
                
                if (session) {
                    session.avatar = avatar;
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
}

// Generate LiveKit token for agent
async function generateAgentToken(roomName, identity, apiKey, apiSecret) {
    const { AccessToken } = await import('livekit-server-sdk');
    
    const token = new AccessToken(apiKey, apiSecret, {
        identity: identity,
        ttl: '2h'
    });
    
    token.addGrant({
        room: roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
    });
    
    return await token.toJwt();
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
