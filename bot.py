import asyncio
import os
import sys
from loguru import logger
from dotenv import load_dotenv

# DEBUG: Inspect BeyTransport signature
import inspect
from pipecat_bey.transport import BeyTransport, BeyParams

print("=" * 60)
print("BeyTransport signature:")
print("=" * 60)
sig = inspect.signature(BeyTransport.__init__)
print(f"__init__{sig}")
print()

for param_name, param in sig.parameters.items():
    if param_name != 'self':
        print(f"  {param_name}:")
        print(f"    - Type: {param.annotation if param.annotation != inspect.Parameter.empty else 'Any'}")
        print(f"    - Default: {param.default if param.default != inspect.Parameter.empty else 'REQUIRED'}")

print()
print("=" * 60)
print("BeyParams:")
print("=" * 60)
print(f"Type: {type(BeyParams)}")
if hasattr(BeyParams, '__annotations__'):
    print("Fields:")
    for field, field_type in BeyParams.__annotations__.items():
        print(f"  - {field}: {field_type}")
if hasattr(BeyParams, 'model_fields'):
    print("Pydantic fields:")
    for field_name, field_info in BeyParams.model_fields.items():
        print(f"  - {field_name}: {field_info}")

print("=" * 60)
sys.exit(0)

from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineTask
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat_bey.transport import BeyTransport, BeyParams
from pipecat.frames.frames import TextFrame, EndFrame

load_dotenv()

logger.remove()
logger.add(sys.stderr, level="DEBUG")

async def main():
    """
    Pipecat bot that uses Beyond Presence transport for coaching sessions with avatar
    """
    
    # Get parameters from environment
    room_name = sys.argv[1] if len(sys.argv) > 1 else os.getenv("LIVEKIT_ROOM")
    avatar_id = os.getenv("BEYOND_PRESENCE_AVATAR_ID")
    bey_api_key = os.getenv("BEYOND_PRESENCE_API_KEY")
    livekit_url = os.getenv("LIVEKIT_WS_URL") or os.getenv("LIVEKIT_URL")
    livekit_api_key = os.getenv("LIVEKIT_API_KEY")
    livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
    
    if not all([room_name, avatar_id, bey_api_key, livekit_url, livekit_api_key, livekit_api_secret]):
        logger.error("Missing required environment variables")
        logger.error(f"LIVEKIT_ROOM: {bool(room_name)}")
        logger.error(f"BEYOND_PRESENCE_AVATAR_ID: {bool(avatar_id)}")
        logger.error(f"BEYOND_PRESENCE_API_KEY: {bool(bey_api_key)}")
        logger.error(f"LIVEKIT_URL/LIVEKIT_WS_URL: {bool(livekit_url)}")
        logger.error(f"LIVEKIT_API_KEY: {bool(livekit_api_key)}")
        logger.error(f"LIVEKIT_API_SECRET: {bool(livekit_api_secret)}")
        sys.exit(1)
    
    logger.info(f"🎬 Starting Pipecat bot with Beyond Presence avatar")
    logger.info(f"   Room: {room_name}")
    logger.info(f"   Avatar ID: {avatar_id}")
    
    # Beyond Presence transport configuration
    transport = BeyTransport(
        BeyParams(
            api_key=bey_api_key,
            avatar_id=avatar_id,
            livekit_url=livekit_url,
            livekit_api_key=livekit_api_key,
            livekit_api_secret=livekit_api_secret,
            room_name=room_name,
            audio_in_enabled=True,
            audio_out_enabled=True,
            video_out_enabled=True,
        )
    )
    
    # ElevenLabs TTS service
    tts = ElevenLabsTTSService(
        api_key=os.getenv("ELEVENLABS_API_KEY"),
        voice_id=os.getenv("ELEVENLABS_VOICE_ID", "EXAVITQu4vr4xnSDxMaL"),
    )
    
    # Build pipeline: TTS → Transport
    pipeline = Pipeline([
        tts,
        transport.output(),
    ])
    
    # Create task
    task = PipelineTask(pipeline)
    
    # Run the bot
    runner = PipelineRunner()
    
    @transport.event_handler("on_first_participant_joined")
    async def on_first_participant_joined(transport, participant):
        logger.info(f"🎤 Participant joined: {participant.get('identity', 'unknown')}")
        # Send initial greeting
        await task.queue_frames([
            TextFrame("Hi! I've reviewed your recent assessment. What would you like to focus on in today's coaching session?")
        ])
    
    @transport.event_handler("on_participant_left")
    async def on_participant_left(transport, participant):
        logger.info(f"👋 Participant left: {participant.get('identity', 'unknown')}")
        await task.queue_frames([EndFrame()])
    
    logger.info("🚀 Starting pipeline runner...")
    await runner.run(task)
    logger.info("✅ Pipeline completed")

if __name__ == "__main__":
    asyncio.run(main())
