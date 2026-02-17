import { defineAgent } from '@livekit/agents';
import * as bey from '@livekit/agents-plugin-bey';
import 'dotenv/config';

console.log('[Agent] 🚀 Coaching Agent initializing...');

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

console.log('[Agent] 📋 Agent defined and ready');
