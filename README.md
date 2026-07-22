# OpenClaw Agent Generator V2

A production-ready AI app generator that creates professional, deployable AI agents for desktop, web, and mobile platforms. Built with Node.js, Electron, Capacitor, and OpenClaw integration.

## What it does

**AI App Generator**: Turn prompts into production-ready AI agents

**Multi-platform Deployment**:
- 🎯 **Desktop**: Native Electron app (Linux/Windows/macOS)
- 📱 **Mobile**: Android app (Capacitor)
- 🌐 **Web**: Hosted Express.js app

**Features**:
- Multi-agent orchestration with Hive Mind
- OpenAI fine-tuning integration
- Real-time conversation engines
- Automation & Telegram integration
- Learning profiles and knowledge graphs
- Professional app scaffolding

## Quick Start

```bash
# Local development
npm run dev

# Desktop build (Linux)
npm run desktop:dist

# Mobile build (Android)
npm run mobile:build:release

# Check syntax
npm run check
```

## Deployment

### Web Hosting
```bash
# Host the backend server on any Node.js platform
node backend.js
```

### Desktop App
```bash
# Generated app will work offline with local config
# Deploy with your preferred Electron builder
```

### Mobile App
```bash
# Android release build
./gradlew assembleRelease

# Distribution links to Google Play Console
npm run mobile:playstore:help
```

## Architecture

### Core Backend (`backend.js`)
- **Express.js server** with secure headers
- **Authentication system** with JWT
- **Database ORM** with JSON persistence
- **Multi-provider LLM routing** (OpenAI, Anthropic, OpenRouter)
- **OpenClaw agent integration**

### Desktop Shell (`desktop-shell/`)
- **Electron main process** for system integration
- **Custom window management** and system tray
- **Deep OS integration** (file system, notifications)
- **Performance monitoring** and updates

### Mobile Shell (`android/`)
- **Capacitor native runtime** for Android
- **Native plugins** for camera, files, notifications
- **Offline capabilities** with local storage
- **Push notifications** and background sync

### Hosted Apps (`generated/`)
- **Static web applications** per agent
- **Live preview URLs** like `/generated/agent-slug/`
- **No-code customization** with blueprint JSON
- **Responsive design** for all devices

## Supported Actions

### Agent Generation
```bash
# Create a new agent via CLI
openclaw agents create --name "My Agent" --description "Does X and Y"

# Deploy it as a web app
openclaw deploy --agent "My Agent" --platform web

# Deploy as desktop app
openclaw deploy --agent "My Agent" --platform desktop

# Deploy as mobile app
openclaw deploy --agent "My Agent" --platform mobile
```

### Automation Features
- **Telegram automation** for agent chat
- **Webhook callbacks** for real-time updates
- **Scheduled tasks** with Cron integration
- **Error monitoring** and auto-recovery

### Workflow Examples

1. **Developer**: Prompt → Agent Generation → Web App → Integration → Launch
2. **Business User**: Idea → Automated Agent → Mobile App → Daily Use → Analytics
3. **Creator**: Content Strategy → Multi-Agent Team → Desktop App → Publishing

## Fine-Tuning Pipeline

1. **Data Collection**: Real conversations + knowledge items
2. **Dataset Export**: `generated/<agent>/train.jsonl`
3. **OpenAI Integration**: Upload → Fine-tune → Deploy
4. **Monitoring**: Track performance, metrics, user feedback

## Configuration

### Environment Variables
```bash
PORT=3000
OPENAI_API_KEY=your_key_here
APP_NAME="My AI Studio"
SESSION_SECRET=your_secret_here
```

### Database Schema
- **agents**: Agent definitions and configs
- **conversations**: User-agent chat history
- **workspaces**: Multi-user organization structures
- **knowledgeItems**: Structured knowledge bases
- **sessions**: Authentication and API sessions

## Production Features

### Security
- **Input validation** and sanitization
- **Rate limiting** (30/min per IP)
- **Secure headers** (CORS, CSP, X-Frame-Options)
- **Authentication** with token-based auth

### Scalability
- **Multi-provider LLM routing** with fallbacks
- **Horizontal scaling** ready for clustering
- **Connection pooling** for database operations
- **Memory management** for long-running processes

### Automation
- **Automated deployments** via Git hooks
- **Health monitoring** with self-diagnostic checks
- **Log aggregation** and error tracking
- **Backup and recovery** procedures

## License

MIT License. Open source AI app generator platform.