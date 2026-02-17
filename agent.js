import { defineAgent, cli, WorkerOptions } from '@livekit/agents';
import * as bey from '@livekit/agents-plugin-bey';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

// Set LIVEKIT_URL from LIVEKIT_WS_URL if needed
if (process.env.LIVEKIT_WS_URL && !process.env.LIVEKIT_URL) {
    process.env.LIVEKIT_URL = process.env.LIVEKIT_WS_URL;
}

console.log('[Agent] 🚀 Coaching Agent initializing...');
console.log('[Agent] Environment:');
console.log(`  - LIVEKIT_URL: ${process.env.LIVEKIT_URL ? '✓' : '✗'}`);
console.log(`  - LIVEKIT_API_KEY: ${process.env.LIVEKIT_API_KEY ? '✓' : '✗'}`);
console.log(`  - BEYOND_PRESENCE_AVATAR_ID: ${process.env.BEYOND_PRESENCE_AVATAR_ID ? '✓' : '✗'}`);

export default defineAgent({
    entry: async (ctx) => {
        console.log(`[Agent] 🎬 Joining room: ${ctx.room.name}`);
        
        await ctx.connect();
        console.log(`[Agent] ✅ Connected to room: ${ctx.room.name}`);
        
        const avatarId = process.env.BEYOND_PRESENCE_AVATAR_ID;
        if (!avatarId) {
            console.error('[Agent] ❌ BEYOND_PRESENCE_AVATAR_ID not set!');
            return;
        }
        
        console.log(`[Agent] 🎭 Starting Beyond Presence avatar: ${avatarId}`);
        
        try {
            const avatar = new bey.Avatar({
                avatarId: avatarId,
            });
            
            // Start avatar - it will automatically sync with room audio
            await avatar.start(ctx);
            
            console.log(`[Agent] ✅ Avatar started and publishing video!`);
            
        } catch (error) {
            console.error('[Agent] ❌ Failed to start avatar:', error);
            throw error;
        }
    },
});

// Start the worker when file is run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log('[Agent] 🚀 Starting worker...');
    cli.runApp(new WorkerOptions({ agent: fileURLToPath(import.meta.url) }));
}

