// Beyond Presence Bridge using LiveKit Agents SDK
import { WorkerOptions, cli, defineAgent } from '@livekit/agents';
import * as bey from '@livekit/agents-plugin-bey';
import 'dotenv/config';

// Set LIVEKIT_URL from LIVEKIT_WS_URL if needed (for SDK compatibility)
if (process.env.LIVEKIT_WS_URL && !process.env.LIVEKIT_URL) {
    process.env.LIVEKIT_URL = process.env.LIVEKIT_WS_URL;
    console.log('[Bridge] Using LIVEKIT_WS_URL as LIVEKIT_URL for SDK compatibility');
}

console.log('[Bridge] 🚀 LiveKit Agent starting...');
console.log('[Bridge] Environment check:');
console.log(`  - LIVEKIT_URL: ${process.env.LIVEKIT_URL ? '✓' : '✗'}`);
console.log(`  - LIVEKIT_API_KEY: ${process.env.LIVEKIT_API_KEY ? '✓' : '✗'}`);
console.log(`  - LIVEKIT_API_SECRET: ${process.env.LIVEKIT_API_SECRET ? '✓' : '✗'}`);
console.log(`  - BEYOND_PRESENCE_API_KEY: ${process.env.BEYOND_PRESENCE_API_KEY ? '✓' : '✗'}`);
console.log(`  - BEYOND_PRESENCE_AVATAR_ID: ${process.env.BEYOND_PRESENCE_AVATAR_ID ? '✓' : '✗'}`);

// Define and export the agent (matching Beyond Presence example)
export default defineAgent({
    entry: async (ctx) => {
        console.log(`[Bridge] 🎬 Agent joining room: ${ctx.room.name}`);
        
        await ctx.connect();
        console.log(`[Bridge] ✅ Agent connected to room`);
        
        const avatarId = process.env.BEYOND_PRESENCE_AVATAR_ID;
        
        if (!avatarId) {
            console.error('[Bridge] ❌ BEYOND_PRESENCE_AVATAR_ID not set!');
            return;
        }
        
        console.log(`[Bridge] 🎭 Starting Beyond Presence avatar: ${avatarId}`);
        
        try {
            // Create Beyond Presence avatar using the plugin
            const avatar = new bey.Avatar({
                avatarId: avatarId,
            });
            
            // Start the avatar - it will automatically detect and sync with audio in the room
            await avatar.start(ctx);
            
            console.log(`[Bridge] ✅ Beyond Presence avatar started successfully!`);
            console.log(`[Bridge] 🎤 Avatar will automatically sync with room audio`);
            
        } catch (error) {
            console.error('[Bridge] ❌ Failed to start Beyond Presence avatar:', error);
            throw error;
        }
    },
});
