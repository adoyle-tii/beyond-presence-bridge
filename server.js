import express from 'express';
import { Room, RoomEvent, AccessToken } from 'livekit-server-sdk';
import { Avatar } from '@livekit/agents-plugin-bey';
import 'dotenv/config';

const app = express();
app.use(express.json());

const LIVEKIT_URL = process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const BEYOND_PRESENCE_AVATAR_ID = process.env.BEYOND_PRESENCE_AVATAR_ID;
const PORT = process.env.PORT || 3000;

console.log('[Bridge] 🚀 Server starting...');
console.log('[Bridge] Environment check:');
console.log(`  - LIVEKIT_URL: ${LIVEKIT_URL ? '✓' : '✗'}`);
console.log(`  - LIVEKIT_API_KEY: ${LIVEKIT_API_KEY ? '✓' : '✗'}`);
console.log(`  - LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET ? '✓' : '✗'}`);
console.log(`  - BEYOND_PRESENCE_AVATAR_ID: ${BEYOND_PRESENCE_AVATAR_ID ? '✓' : '✗'}`);

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'beyond-presence-bridge' });
});

// Start avatar endpoint - called by Cloudflare Worker
app.post('/start-avatar', async (req, res) => {
    const { roomName, avatarId, sessionId, coachAudioParticipant } = req.body;
    
    console.log('[Bridge] 🎬 Starting avatar for room:', roomName);
    console.log('[Bridge] Session ID:', sessionId);
    console.log('[Bridge] Coach audio participant:', coachAudioParticipant);
    
    try {
        const room = new Room();
        
        // Generate token for the bridge agent
        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: `bridge-agent-${sessionId}`,
        });
        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            hidden: false,
        });
        const token = at.toJwt();
        
        // Connect to room
        await room.connect(LIVEKIT_URL, token);
        console.log('[Bridge] ✅ Connected to room');
        
        // Wait for the coach-voice track
        room.on(RoomEvent.TrackPublished, async (publication, participant) => {
            console.log(`[Bridge] Track published: ${publication.trackName} by ${participant.identity}`);
            
            if (publication.trackName === 'coach-voice') {
                console.log('[Bridge] 🎭 Coach voice detected, starting avatar...');
                
                try {
                    const avatar = new Avatar({
                        avatarId: avatarId || BEYOND_PRESENCE_AVATAR_ID,
                    });
                    
                    // Start avatar synced to the coach-voice track
                    await avatar.start({
                        room,
                        audioTrackName: 'coach-voice',
                        audioParticipantIdentity: coachAudioParticipant,
                    });
                    
                    console.log('[Bridge] ✅ Avatar started successfully!');
                } catch (error) {
                    console.error('[Bridge] ❌ Failed to start avatar:', error);
                }
            }
        });
        
        res.json({ success: true, message: 'Bridge agent connected, waiting for coach audio' });
        
    } catch (error) {
        console.error('[Bridge] ❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`[Bridge] 🎧 Server listening on port ${PORT}`);
});
