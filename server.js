import express from 'express';
import { AccessToken } from 'livekit-server-sdk';
import 'dotenv/config';

const app = express();
app.use(express.json());

const LIVEKIT_URL = process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
const BEYOND_PRESENCE_API_KEY = process.env.BEYOND_PRESENCE_API_KEY;
const BEYOND_PRESENCE_AVATAR_ID = process.env.BEYOND_PRESENCE_AVATAR_ID;
const PORT = process.env.PORT || 3000;

console.log('[Bridge] 🚀 Server starting...');
console.log('[Bridge] Environment check:');
console.log(`  - LIVEKIT_URL: ${LIVEKIT_URL ? '✓' : '✗'}`);
console.log(`  - LIVEKIT_API_KEY: ${LIVEKIT_API_KEY ? '✓' : '✗'}`);
console.log(`  - LIVEKIT_API_SECRET: ${LIVEKIT_API_SECRET ? '✓' : '✗'}`);
console.log(`  - BEYOND_PRESENCE_API_KEY: ${BEYOND_PRESENCE_API_KEY ? '✓' : '✗'}`);
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
    console.log('[Bridge] Avatar ID:', avatarId || BEYOND_PRESENCE_AVATAR_ID);
    
    try {
        // Generate token for the avatar
        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: `avatar-${avatarId || BEYOND_PRESENCE_AVATAR_ID}`,
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
        
        console.log('[Bridge] Generated token for avatar');
        console.log('[Bridge] LIVEKIT_URL:', LIVEKIT_URL);
        console.log('[Bridge] Room:', roomName);
        
        const payload = {
            avatar_id: avatarId || BEYOND_PRESENCE_AVATAR_ID,
            livekit_room: roomName,
            url: LIVEKIT_URL,
            token: token,
        };
        
        console.log('[Bridge] Payload keys:', Object.keys(payload));
        console.log('[Bridge] Payload values check:', {
            avatar_id: typeof payload.avatar_id,
            livekit_room: typeof payload.livekit_room,
            url: typeof payload.url,
            token: typeof payload.token,
        });
        
        // Call Beyond Presence API to start the avatar session
        const beyondResponse = await fetch('https://api.bey.dev/v1/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': BEYOND_PRESENCE_API_KEY,
            },
            body: JSON.stringify(payload),
        });
        
        const beyondData = await beyondResponse.json();
        
        if (!beyondResponse.ok) {
            console.error('[Bridge] ❌ Beyond Presence API error:', beyondData);
            return res.status(500).json({ 
                success: false, 
                error: 'Beyond Presence API error',
                details: beyondData 
            });
        }
        
        console.log('[Bridge] ✅ Avatar session created:', beyondData.id);
        console.log('[Bridge] Status:', beyondData.status);
        
        res.json({ 
            success: true, 
            sessionId: beyondData.id,
            status: beyondData.status,
            message: 'Avatar started successfully' 
        });
        
    } catch (error) {
        console.error('[Bridge] ❌ Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`[Bridge] 🎧 Server listening on port ${PORT}`);
});
