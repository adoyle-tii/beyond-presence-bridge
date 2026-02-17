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

console.log('[Server] 🚀 Starting...');
console.log(`[Server] LIVEKIT_URL: ${LIVEKIT_URL}`);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.post('/start-avatar', async (req, res) => {
    const { roomName, sessionId } = req.body;
    
    console.log('[Avatar] Starting for room:', roomName);
    
    try {
        // Generate token for avatar
        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: `avatar-${BEYOND_PRESENCE_AVATAR_ID}`,
        });
        at.addGrant({ roomJoin: true, room: roomName, canPublish: true, canSubscribe: true });
        const token = await at.toJwt();
        
        // Start Beyond Presence session
        const response = await fetch('https://api.bey.dev/v1/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': BEYOND_PRESENCE_API_KEY,
            },
            body: JSON.stringify({
                avatar_id: BEYOND_PRESENCE_AVATAR_ID,
                livekit_room: roomName,
                url: LIVEKIT_URL,
                token: token,
                auto_start: true,
            }),
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('[Avatar] API error:', response.status, errorText);
            return res.status(500).json({ error: `Beyond Presence API error: ${response.status}`, details: errorText });
        }
        
        const data = await response.json();
        console.log('[Avatar] Session created:', data.id, 'Status:', data.status);
        
        res.json({ success: true, sessionId: data.id, status: data.status });
        
    } catch (error) {
        console.error('[Avatar] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`[Server] Listening on ${PORT}`));
