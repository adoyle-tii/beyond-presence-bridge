# Beyond Presence Bridge Server

LiveKit agent bridge for Beyond Presence avatar integration with the Sales Coach extension.

## What This Does

This lightweight Node.js server:
1. Joins LiveKit coaching session rooms as an "agent"
2. Subscribes to ElevenLabs audio from the browser client
3. Initializes Beyond Presence avatar using the official LiveKit plugin
4. Enables the avatar to publish video synchronized with coach audio

## Architecture

```
Browser Client
  ├─> LiveKit Room (publishes user mic + coach audio)
  └─> ElevenLabs WebSocket (direct connection)

Bridge Server (this)
  └─> LiveKit Room (as agent)
       ├─> Subscribes to coach audio
       └─> Starts Beyond Presence avatar

Beyond Presence Avatar
  └─> LiveKit Room
       ├─> Subscribes to audio
       └─> Publishes synchronized video
```

## Railway Deployment

### Step 1: Push to GitHub

```bash
cd bridge-server
git init
git add .
git commit -m "Initial bridge server"
git remote add origin https://github.com/YOUR_USERNAME/beyond-presence-bridge.git
git push -u origin main
```

### Step 2: Deploy on Railway

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your repository
5. Railway will auto-detect Node.js and deploy

### Step 3: Add Environment Variables

In Railway dashboard, go to **Variables** tab and add:

```
LIVEKIT_WS_URL=wss://tii-sales-enablement-olpncg29.livekit.cloud
LIVEKIT_API_KEY=APIbh6rKf6P4XQ4
LIVEKIT_API_SECRET=your_livekit_secret
BEYOND_PRESENCE_API_KEY=sk-NoP30A5ScmsfWvwXBkutnW84L8V5z-QYB7r7TjdQqG8
BEYOND_PRESENCE_AVATAR_ID=7c9ca52f-d4f7-46e1-a4b8-0c8655857cc3
```

### Step 4: Get Your Server URL

Railway will provide a URL like:
```
https://beyond-presence-bridge-production.up.railway.app
```

Copy this URL - you'll need it for your Cloudflare Worker.

### Step 5: Update Cloudflare Worker

Add environment variable in Cloudflare dashboard:
```
BRIDGE_SERVER_URL=https://your-app.railway.app
```

## Local Development

```bash
# Install dependencies
npm install

# Copy environment template
cp env.example .env

# Edit .env with your credentials
nano .env

# Run server
npm start

# Or with auto-reload
npm run dev
```

Test the server:
```bash
curl http://localhost:3000/health
```

## API Endpoints

### `GET /health`
Health check endpoint
```bash
curl https://your-app.railway.app/health
```

Response:
```json
{
  "status": "healthy",
  "activeSessions": 0,
  "uptime": 123.45
}
```

### `POST /start-avatar`
Start avatar for a coaching session (called by Cloudflare Worker)

```bash
curl -X POST https://your-app.railway.app/start-avatar \
  -H "Content-Type: application/json" \
  -d '{
    "roomName": "coaching-abc123",
    "avatarId": "7c9ca52f-d4f7-46e1-a4b8-0c8655857cc3",
    "sessionId": "abc123"
  }'
```

Response:
```json
{
  "status": "started",
  "roomName": "coaching-abc123",
  "sessionId": "abc123"
}
```

### `POST /stop-avatar`
Stop avatar session (called when coaching ends)

```bash
curl -X POST https://your-app.railway.app/stop-avatar \
  -H "Content-Type: application/json" \
  -d '{
    "roomName": "coaching-abc123"
  }'
```

## Monitoring

### Railway Dashboard
- View logs in real-time
- Monitor CPU/memory usage
- Check active deployments
- View environment variables

### Health Check
Set up external monitoring (like UptimeRobot) to ping:
```
https://your-app.railway.app/health
```

## Troubleshooting

### "Missing required environment variables"
- Check Railway dashboard → Variables tab
- Ensure all 5 variables are set correctly

### "Failed to connect to LiveKit"
- Verify `LIVEKIT_WS_URL` includes `wss://`
- Check API key/secret are correct
- Test LiveKit connection separately

### "Avatar not appearing"
- Check Railway logs for "Beyond Presence avatar started"
- Verify avatar ID is correct
- Check Beyond Presence dashboard for session activity

### View Logs
Railway dashboard → Deployments → View Logs

Or use Railway CLI:
```bash
railway logs
```

## Cost Estimate

Based on Railway's pricing:
- **Free tier**: $5 credit/month
- **Expected usage**: ~$2-4/month for occasional coaching sessions
- **Scaling**: Automatically handles traffic spikes

## Security Notes

- Environment variables are encrypted in Railway
- HTTPS enforced by default
- No authentication on endpoints (assumes calls only from your Worker)
- Add API key authentication if exposing publicly

## Next Steps

After deployment:
1. Test health endpoint
2. Update Cloudflare Worker with `BRIDGE_SERVER_URL`
3. Launch a test coaching session
4. Verify avatar appears in browser

## Support

- Railway docs: https://docs.railway.app
- LiveKit docs: https://docs.livekit.io
- Beyond Presence docs: https://docs.bey.dev
