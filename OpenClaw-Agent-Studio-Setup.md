# OpenClaw Agent Studio - Complete Deployment Guide

## Overview

OpenClaw Agent Studio is a professional, production-ready AI application that generates, deploys, and manages sophisticated AI agents across desktop, mobile, and web platforms. Built with the Agent Generator V2 project, it features advanced multi-agent orchestration, OpenClaw integration, real-time automation, and a full-stack deployment pipeline.

## Quick Start (20 minutes)

```bash
# 1. Clone the project (if needed)
git clone https://github.com/your-repo/agent-generator-v2

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your API keys and secrets

# 4. Start development server
npm run dev

# 5. Access the studio
# Web: http://localhost:3000
# Desktop: npm run desktop:dev
```

## Project Structure

```
agent-generator-v2/
├── backend.js                    # Core Express server
├── package.json                   # Project configuration
├── desktop-shell/                 # Electron desktop app
├── android/                       # Android mobile app (Capacitor)
├── public/                        # Web UI (React - optional)
├── generated/                     # Hosted app templates
├── lib/                           # Backend libraries
├── scripts/                       # Build and deployment scripts
├── README.md                      # This guide
└── OpenClaw-Agent-Studio-Setup.md # Deployment documentation
```

## Core Features

### 🎯 **AI Agent Generation**
- **Prompt to App**: Convert text prompts into production-ready AI agents
- **Multi-agent Teams**: Create specialized agent squads (research, coding, critic, etc.)
- **OpenClaw Integration**: Deploy agents with full OpenClaw capabilities

### 🚀 **Multi-Platform Deployment**
- **Desktop**: Native Electron app with system integration
- **Mobile**: Android Capacitor app with native features
- **Web**: Cloud-hosted Express server with real-time capabilities

### 🔧 **Advanced Capabilities**
- **Fine-Tuning Pipeline**: Integrate with OpenAI for custom model training
- **Hive Mind Orchestration**: Coordinate multiple agents for complex tasks
- **Telegram Automation**: Real-time chat and automation via Telegram
- **Learning Profiles**: Build persistent knowledge and feedback loops
- **Webhook Integration**: Real-time updates and callbacks

### 🛡️ **Production Ready**
- **Authentication**: JWT-based security with session management
- **Rate Limiting**: IP-based protection (30/min default)
- **Input Validation**: Sanitization and security headers
- **Monitoring**: Health checks and error tracking
- **Backups**: Automated backup and recovery procedures

## Installation & Setup

### Prerequisites
```bash
# Node.js (v18+)
node --version
# npm (v8+)
npm --version
# Optional: Node.js (v22.22.2 recommended for deployment)
```

### Environment Variables
Create `.env` file based on template:

```bash
# Server configuration
PORT=3000
APP_NAME="OpenClaw Agent Studio"
SESSION_SECRET=your_super_secret_key_here
NODE_ENV=production

# OpenAI integration (for fine-tuning)
OPENAI_API_KEY=sk-your_openai_api_key_here

# Telegram automation (optional)
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
TELEGRAM_CHAT_ID=your_chat_id

# Database (if using external DB)
# DATABASE_URL=your_database_url

# OpenClaw integration
OPENCLAW_API_KEY=your_openclaw_api_key
OPENCLAW_BASE_URL=https://api.openclaw.ai
```

## Running the Studio

### Web Development (Local)
```bash
# Start the Express backend server
npm run dev
# Access at: http://localhost:3000
```

### Desktop Application
```bash
# Local development
npm run desktop:dev

# Build for production (Linux)
npm run desktop:dist

# Quick syntax check
npm run check
```

### Mobile Application
```bash
# Android development
npm run mobile:add android
npm run mobile:sync
npm run mobile:open

# Build release version
npm run mobile:build:release

# Android Studio integration
# The android/ directory contains native Android project files
```

## Development Workflows

### 1. Creating New Agents
```bash
# Web UI method
# Navigate to http://localhost:3000
# Click "Create Agent" and fill the form

# CLI method
openclaw agents create \
  --name "Sales Assistant" \
  --description "Helps with customer inquiries and sales demos" \
  --model "gpt-4o" \
  --workspace "default"
```

### 2. Deploying Agents
```bash
# Deploy to web platform
openclaw deploy \
  --agent "Sales Assistant" \
  --platform web \
  --mode production

# Deploy to desktop
openclaw deploy \
  --agent "Sales Assistant" \
  --platform desktop \
  --mode packaged

# Deploy to mobile
openclaw deploy \
  --agent "Sales Assistant" \
  --platform mobile \
  --mode android
```

### 3. Agent Automation Setup
```bash
# Configure Telegram automation
# In the web UI, go to "Automation" tab
# Connect your Telegram bot
# Set webhook URL

# Configure openclaw agent binding
# Use the automation panel in the web interface
```

## OpenClaw Integration

### Agent Creation from OpenClaw
```javascript
// From backend.js OpenClaw integration functions
const agentBundle = buildOpenClawAgentBundle(agent);
const deploymentDir = buildDeploymentDirectory(agent);
```

### Features:
- **Live Agent Deployment**: Deploy agents directly from OpenClaw dashboard
- **Template Generation**: Auto-generate agent templates with OpenClaw defaults
- **Real-time Updates**: Sync agent changes between OpenClaw and local deployment
- **Backup Management**: Automatic backup of agent configurations

## Mobile App (Android)

### Native Features
- **File System Access**: Read/write local files
- **Camera Integration**: Capture images for OCR/document processing
- **Notifications**: Push notifications and local alerts
- **Offline Mode**: Basic functionality without internet
- **Capacitor Plugins**: Native bridges for system features

### Configuration
The `android/` directory contains:
- `app/` - Android application module
- `capacitor.config.js` - Capacitor configuration
- `build.gradle` - Build configuration
- `strings.xml` - Localized strings

### Build Commands
```bash
# Debug build
./gradlew assembleDebug

# Release build (for distribution)
./gradlew assembleRelease

# Bundle for Google Play
./gradlew bundleRelease
```

## Desktop App (Electron)

### Native Features
- **System Tray**: Minimize to tray with context menu
- **Multi-window Support**: Multiple agent instances
- **Deep Link Support**: Open specific agents from desktop
- **Performance Monitoring**: CPU/memory usage tracking
- **Update System**: Automatic update checking and installation

### Configuration
The `desktop-shell/` directory contains:
- `main.js` - Electron main process
- `preload.js` - Preload script with secure APIs
- `package.json` - Electron builder configuration
- `icon/` - Application icons

### Build Commands
```bash
# Linux AppImage
npm run desktop:dist

# Linux deb package
npm run desktop:dist -- --linux deb

# macOS dmg
npm run desktop:dist -- --mac dmg

# Windows installer
npm run desktop:dist -- --win nsis
```

## Web Platform

### Hosted Apps
Each generated agent gets a live preview URL:
```
http://your-server/generation/<agent-slug>?key=<public-key>
http://your-server/generation/<agent-slug>
```

### API Endpoints
```bash
# Agent management
POST /api/agents                    # Create agent
GET /api/agents/:id                 # Get agent details
PUT /api/agents/:id                 # Update agent
DELETE /api/agents/:id              # Delete agent

# Agent chat
POST /api/agents/:slug/chat         # Chat with agent

# Authentication
POST /api/auth/login                # Login
POST /api/auth/logout               # Logout
POST /api/auth/register             # Register (if enabled)

# Static assets
GET /agent/:slug                    # Agent page with key
GET /generated/:agent/slug          # Generated app preview
```

## Fine-Tuning Pipeline

### Overview
Automatically collect agent conversations and fine-tune OpenAI models:

1. **Data Collection**: Real conversations + knowledge items
2. **Dataset Preparation**: Export to `generated/<agent>/train.jsonl`
3. **OpenAI Integration**: Upload and fine-tune models
4. **Monitoring**: Track performance and feedback

### Commands
```bash
# Export fine-tuning dataset
# From the backend, agents with fine-tune profiles can export:
cat backend.js | grep -A 20 "exportFineTuneDataset"

# Provider-specific commands (OpenAI focus)
node scripts/fine-tune-upload.mjs
```

## Automation & Integration

### Telegram Integration
```bash
# Configure from web UI
# Automation settings:
# - Telegram bot token
# - Chat ID
# - OpenClaw agent ID
# - Webhook URL
```

### Webhooks
- **Ready Webhooks**: Notify when agents are ready
- **Status Webhooks**: Real-time status updates
- **Error Webhooks**: Alert on system issues

### Scheduling
```javascript
// From backend.js cron/Scheduling support
// Heartbeat system for periodic checks
// Reminder system for follow-ups
cron.schedule('0 */6 * * *', async () => {
  // Check agent health
  // Send reminders
  // Run diagnostics
});
```

## Security & Compliance

### Data Protection
- **Input Validation**: All user inputs are sanitized
- **Rate Limiting**: Protect against abuse (30/min IP limit)
- **Secure Headers**: CSP, CORS, X-Frame-Options configured
- **HTTPS Only**: Enforce secure connections in production

### Access Control
- **JWT Authentication**: Secure session management
- **Role-Based Access**: Different permissions for users
- **API Key Management**: Secure agent access tokens
- **IP Whitelisting**: Restrict access by IP range

### Backup & Recovery
- **Automated Backups**: Scheduled database backups
- **Manual Export**: Export agent configurations
- **Disaster Recovery**: Restore procedures
- **Version Control**: Git integration for code management

## Monitoring & Debugging

### Health Checks
```bash
# Self-diagnostic checks
npm run healthcheck

# Server status
# Access: http://localhost:3000/health
# Returns: server status, dependencies, memory usage
```

### Logging
- **Application Logs**: Request/response tracking
- **Error Logs**: Detailed error information
- **Access Logs**: User activity tracking
- **Performance Logs**: Response times and metrics

### Debugging Tools
- **Browser DevTools**: Inspect web UI elements
- **Node.js Inspector**: Debug server code
- **Electron DevTools**: Debug desktop app
- **Android Studio**: Debug mobile app

## Advanced Features

### Hive Mind Orchestration
Multi-agent teams working together:
```javascript
{
  "mode": "solo",
  "specialistRoles": ["research", "coding", "critic", "qa", "planner"],
  "orchestrationNotes": "Coordinate research and development tasks",
  "decisionStyle": "captain",
  "criticEnabled": true
}
```

### Learning Profiles
Build persistent agent knowledge:
- **Preferences**: Working style and interaction preferences
- **Dos/Donts**: Do's and don'ts learned from interactions
- **Topics**: Knowledge areas and expertise
- **Feedback**: User feedback collection and analysis

### Automation Templates
Pre-built automation workflows:
- **Sales**: Lead qualification and follow-up
- **Support**: Customer issue resolution
- **Development**: Code review and testing
- **Research**: Information gathering and analysis

## Deployment & Scaling

### Production Deployment
```bash
# Basic deployment
npm install
apm start

# With PM2 (recommended)
npm install -g pm2
pm2 start backend.js --name openclaw-agent-studio
pm2 startup
pm2 save

# Environment-specific configs
NODE_ENV=production PORT=443 SSL_CERT=/path/to/cert SSL_KEY=/path/to/key
```

### Scaling Strategies
- **Horizontal Scaling**: Multiple server instances
- **Load Balancing**: Distribute traffic across servers
- **Database Scaling**: Read replicas for high traffic
- **CDN Integration**: Serve static assets globally

## Troubleshooting

### Common Issues

#### 1. "Model Fallback" Warnings
If you see model fallback warnings:
- Check OpenAI API key and quota
- Verify model availability
- Consider upgrading plans

#### 2. Rate Limiting
If you hit rate limits:
- Implement token caching
- Use fallback models
- Check provider quotas

#### 3. Database Issues
If database operations fail:
- Verify database connectivity
- Check disk space
- Review backup procedures

#### 4. Mobile Build Failures
If mobile builds fail:
- Ensure Android build tools are updated
- Check environment variables
- Verify Capacitor sync status

### Debugging Commands
```bash
# Check server status
pm2 logs
pm2 monit

# Application logs
npm run check

# Environment check
node -e "console.log('Node version:', process.version)"

# Dependency check
npm ls --depth=0
```

## Support & Resources

### Documentation
- **README.md**: Project overview and setup
- **OpenClaw-Agent-Studio-Setup.md**: This guide
- **backend.js**: Core implementation details
- **API Documentation**: Available in web UI

### Community
- **GitHub Issues**: Report bugs and request features
- **Discord/Slack**: Real-time community support
- **Documentation**: OpenClaw official docs

### Training & Examples
- **Demo Agents**: Pre-built agent examples
- **Tutorials**: Step-by-step guides
- **API Examples**: Code snippets and samples
- **Best Practices**: Production deployment guides

## License

MIT License. Open source AI application platform.

---

**OpenClaw Agent Studio** - The complete solution for professional AI agent generation and deployment.

Built with ❤️ by the OpenClaw team
Version: 2.0.0
Last Updated: $(date +%Y-%m-%d)