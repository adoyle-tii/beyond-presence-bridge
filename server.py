from flask import Flask, request, jsonify
import subprocess
import os
from loguru import logger

app = Flask(__name__)

# Store running bot processes
active_bots = {}

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "service": "pipecat-bot-launcher"})

@app.route('/start-bot', methods=['POST'])
def start_bot():
    data = request.json
    room_name = data.get('roomName')
    session_id = data.get('sessionId')
    
    if not room_name:
        return jsonify({"error": "roomName required"}), 400
    
    logger.info(f"🎬 Starting bot for room: {room_name}")
    
    try:
        # Start bot as subprocess
        process = subprocess.Popen(
            ['python', 'bot.py', room_name],
            env=os.environ.copy(),
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE
        )
        
        active_bots[room_name] = {
            'process': process,
            'session_id': session_id
        }
        
        logger.info(f"✅ Bot started for room: {room_name}")
        return jsonify({
            "success": True,
            "roomName": room_name,
            "sessionId": session_id
        })
        
    except Exception as e:
        logger.error(f"❌ Failed to start bot: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8080))
    app.run(host='0.0.0.0', port=port)
