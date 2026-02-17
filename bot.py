import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.bey import BeyondPresenceService
from pipecat.transports.services.livekit import LiveKitTransport, LiveKitParams
from pipecat.processors.aggregators.openai_llm_context import OpenAILLMContext

load_dotenv()

logger.remove()
logger.add(sys.stderr, level="DEBUG")

async def main():
    """
    Pipecat bot that connects ElevenLabs → Beyond Presence for coaching sessions
    """
    
    # Get room name from command line or env
    room_name = sys.argv[1] if len(sys.argv) > 1 else os.getenv("LIVEKIT_ROOM")
    
    if not room_name:
        logger.error("No room name provided. Usage: python bot.py <room_name>")
        sys.exit(1)
    
    logger.info(f"🎬 Starting Pipecat bot for room: {room_name}")
    
    # LiveKit transport configuration
    transport = LiveKitTransport(
        LiveKitParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            video_out_enabled=True,
            vad_enabled=True,
            vad_analyzer=None,  # Use LiveKit's built-in VAD
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
            url=os.getenv("LIVEKIT_WS_URL"),
            room=room_name,
        )
    )
    
    # ElevenLabs TTS service
    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM"),  # Default voice
    )
    
    # Beyond Presence avatar service
    avatar = BeyondPresenceService(
        api_key=os.getenv("BEYOND_PRESENCE_API_KEY"),
        avatar_id=os.getenv("BEYOND_PRESENCE_AVATAR_ID"),
    )
    
    # Build pipeline: TTS → Avatar
    pipeline = Pipeline([
        tts,
        avatar,
        transport.output(),
    ])
    
    # Create task
    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            allow_interruptions=True,
            enable_metrics=True,
        )
    )
    
    # Run the bot
    runner = PipelineRunner()
    
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        logger.info(f"🎤 Participant joined: {participant}")
        await task.queue_frames([LLMMessagesFrame([
            {
                "role": "system",
                "content": "You are a sales coach. Start by greeting the seller."
            }
        ])])
    
    logger.info("🚀 Starting pipeline runner...")
    await runner.run(task)

if __name__ == "__main__":
    asyncio.run(main())
