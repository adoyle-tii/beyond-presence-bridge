// Beyond Presence Bridge using LiveKit Agents SDK
// Based on: https://docs.bey.dev/integrations/speech-to-video/livekit

import { WorkerOptions, cli, defineAgent } from '@livekit/agents';
import * as bey from '@livekit/agents-plugin-bey';
import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy',
        uptime: process.uptime()
    });
});

// HTTP server for health checks and triggers
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[Bridge] 🚀 HTTP server running on port ${PORT}`);
    console.log(`[Bridge] Environment check:`);
    console.log(`  - LIVEKIT_URL: ${process.env.LIVEKIT_URL ? '✓' : '✗'}`);
    console.log(`  - LIVEKIT_API_KEY: ${process.env.LIVEKIT_API_KEY ? '✓' : '✗'}`);
    console.log(`  - LIVEKIT_API_SECRET: ${process.env.LIVEKIT_API_SECRET ? '✓' : '✗'}`);
    console.log(`  - BEYOND_PRESENCE_API_KEY: ${process.env.BEYOND_PRESENCE_API_KEY ? '✓' : '✗'}`);
    console.log(`  - BEYOND_PRESENCE_AVATAR_ID: ${process.env.BEYOND_PRESENCE_AVATAR_ID ? '✓' : '✗'}`);
});

// Define the LiveKit agent
export default defineAgent({
    entry: async (ctx) => {
        console.log('[Bridge] Agent entered room:', ctx.room.name);
        
        await ctx.connect();
        console.log('[Bridge] Agent connected to room');
        
        // Initialize Beyond Presence avatar
        const avatarId = process.env.BEYOND_PRESENCE_AVATAR_ID;
        
        if (!avatarId) {
            console.error('[Bridge] BEYOND_PRESENCE_AVATAR_ID not set!');
            return;
        }
        
        console.log(`[Bridge] Starting Beyond Presence avatar: ${avatarId}`);
        
        try {
            // Create Beyond Presence avatar
            const avatar = new bey.Avatar({
                avatarId: avatarId,
            });
            
            // Start the avatar - it will automatically sync with audio in the room
            await avatar.start(ctx);
            
            console.log(`[Bridge] ✅ Beyond Presence avatar started and syncing with room audio`);
            
            // Keep the agent running
            await ctx.wait_for_participants();
            
        } catch (error) {
            console.error('[Bridge] Failed to start Beyond Presence avatar:', error);
        }
    },
});

// Start the LiveKit agent worker
if (import.meta.url === `file://${process.argv[1]}`) {
    cli.runApp(new WorkerOptions({
        agent: defineAgent,
    }));
}
