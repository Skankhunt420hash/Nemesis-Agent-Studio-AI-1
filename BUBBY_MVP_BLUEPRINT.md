# Bubby MVP Blueprint

## Produktkern
**Bubby = Erstelle, teste, automatisiere und deploye eigene KI-Agenten direkt in der App.**

Ziel für v1:
- Agent anlegen
- Agent in der App chatten/testen
- Wissen speichern
- Tools pro Agent aktivieren
- Trigger per Manual + Webhook + optional Cron
- Runs/Fehler sichtbar machen
- OpenClaw-Export/Deploy später sauber andocken

---

## 1) MVP Scope

### Muss in v1 rein
1. Agent Registry
2. Agent Chat Runtime
3. Agent Memory (basic)
4. Tool Runtime mit 3-5 Tools
5. Automation Trigger (manual, webhook, cron-lite)
6. Run Logs

### Noch nicht in v1
- Multi-tenant Rechte-System fein ausbauen
- komplexe Multi-Agent-Swarms
- Marketplace
- fancy Templates / Animationen
- Full fine-tuning pipeline als Kernfeature

---

## 2) Zielarchitektur

### A. App / Studio
UI zum:
- Agent erstellen
- Agent konfigurieren
- Chat testen
- Wissen pflegen
- Automationen bauen
- Logs sehen
- Deploy auslösen

### B. Core API
API-Schicht für:
- Agent CRUD
- Chat Runs
- Knowledge CRUD
- Tool Config
- Automation CRUD
- Trigger-Handling
- Logs / Status / Deploy Jobs

### C. Runtime Engine
Ablauf:
1. Agent laden
2. Session/Memory laden
3. Systemprompt bauen
4. Modell auswählen
5. Tool Calls ausführen
6. Antwort erzeugen
7. Verlauf + Logs speichern

### D. Automation Engine
- manual trigger
- webhook trigger
- cron trigger
- retries
- run state
- error capture

### E. Worker Layer (leichtes MVP)
Anfangs im selben Node-Prozess möglich.
Später auslagern in echte Queue/Worker.

---

## 3) Datenmodell (DB Schema)

Bestehende `data/db.json` Basis beibehalten, aber erweitern.

### agents
```json
{
  "id": "agt_x",
  "workspaceId": "wsp_x",
  "name": "Sales Agent",
  "slug": "sales-agent",
  "status": "draft",
  "goal": "Qualify and reply to leads",
  "description": "Handles inbound leads",
  "persona": "sharp, friendly, direct",
  "language": "de",
  "systemPrompt": "...",
  "model": "openai/gpt-5.4-mini",
  "temperature": 0.4,
  "tools": ["http_request", "send_webhook", "file_store"],
  "memoryConfig": {
    "historyLimit": 20,
    "longTermEnabled": true,
    "retrievalEnabled": false
  },
  "automationConfig": {
    "enabled": true
  },
  "deployConfig": {
    "web": false,
    "telegram": false,
    "openclaw": false
  },
  "createdAt": "...",
  "updatedAt": "..."
}
```

### knowledgeItems
Bestehende eingebettete Agent-Wissensitems können bleiben, aber sauber strukturieren:
```json
{
  "id": "know_x",
  "agentId": "agt_x",
  "title": "FAQ Preis",
  "content": "...",
  "kind": "note",
  "source": "manual",
  "tags": ["sales", "pricing"],
  "createdAt": "..."
}
```

### conversations
```json
{
  "id": "conv_x",
  "agentId": "agt_x",
  "workspaceId": "wsp_x",
  "channel": "app",
  "sessionKey": "local",
  "messages": [
    {"role": "user", "content": "Hallo", "createdAt": "..."},
    {"role": "assistant", "content": "Hi", "createdAt": "..."}
  ],
  "createdAt": "...",
  "updatedAt": "..."
}
```

### automations
Neu:
```json
{
  "id": "aut_x",
  "agentId": "agt_x",
  "name": "Lead Webhook",
  "enabled": true,
  "trigger": {
    "type": "webhook",
    "path": "/api/triggers/webhook/lead-123"
  },
  "steps": [
    {"type": "run_agent", "input": "Analysiere den Lead und gib Antwortvorschlag"},
    {"type": "tool", "tool": "send_webhook", "config": {"url": "https://..."}}
  ],
  "lastRunAt": "",
  "createdAt": "...",
  "updatedAt": "..."
}
```

### runLogs
Neu:
```json
{
  "id": "run_x",
  "agentId": "agt_x",
  "automationId": "aut_x",
  "source": "chat|manual|webhook|cron",
  "status": "success|error|running",
  "input": {"message": "..."},
  "output": {"reply": "..."},
  "toolCalls": [
    {"tool": "http_request", "status": "success", "durationMs": 412}
  ],
  "error": null,
  "startedAt": "...",
  "finishedAt": "..."
}
```

### toolCredentials
Später verschlüsseln; im MVP nur minimal und vorsichtig.
```json
{
  "id": "cred_x",
  "workspaceId": "wsp_x",
  "tool": "send_webhook",
  "label": "CRM Webhook",
  "config": {"url": "https://..."},
  "createdAt": "..."
}
```

---

## 4) API Routen

### Agenten
- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:id`
- `PATCH /api/agents/:id`
- `DELETE /api/agents/:id`

### Chat / Runtime
- `POST /api/agents/:id/chat`
- `GET /api/agents/:id/conversations`
- `GET /api/conversations/:id`

### Wissen
- `GET /api/agents/:id/knowledge`
- `POST /api/agents/:id/knowledge`
- `PATCH /api/agents/:id/knowledge/:itemId`
- `DELETE /api/agents/:id/knowledge/:itemId`

### Tools
- `GET /api/tools/catalog`
- `GET /api/agents/:id/tools`
- `PATCH /api/agents/:id/tools`

### Automationen
- `GET /api/agents/:id/automations`
- `POST /api/agents/:id/automations`
- `PATCH /api/automations/:id`
- `DELETE /api/automations/:id`
- `POST /api/automations/:id/run`

### Trigger
- `POST /api/triggers/webhook/:token`
- `POST /api/triggers/cron/:id/run`

### Logs
- `GET /api/agents/:id/runs`
- `GET /api/runs/:id`

### Deploy
- `POST /api/agents/:id/export-openclaw`
- `POST /api/agents/:id/deploy-openclaw`
- später: `POST /api/agents/:id/deploy-web`

---

## 5) App Screens

### Screen 1: Agentenübersicht
- Liste aller Agenten
- Status
- letzter Run
- Buttons: Öffnen / Chat / Automation / Deploy

### Screen 2: Agent Builder
Tabs:
- Identity
- Brain
- Knowledge
- Tools
- Automations
- Deploy

### Screen 3: Agent Chat Lab
- Chatfenster
- Session Reset
- Tool Call Trace
- Antwortdauer
- Token/Kosten grob

### Screen 4: Knowledge Manager
- Einträge hinzufügen
- editieren
- Tags
- Quellen

### Screen 5: Automation Builder
- Trigger wählen
- Prompt-Step
- Tool-Step
- Delay-Step
- Bedingungen später

### Screen 6: Logs / Runs
- success/error/running
- Input/Output
- Tool Calls
- Fehlerursache

---

## 6) Ordnerstruktur

```text
agent-generator-v2/
  backend.js
  lib/
    auth.js
    store.js
    llm.js
    runtime/
      agent-runtime.js
      memory.js
      prompt-builder.js
      tool-runner.js
      run-logger.js
    automations/
      automation-engine.js
      triggers.js
      cron-lite.js
    agents/
      agent-service.js
      knowledge-service.js
      deploy-service.js
  public/
    app.js
    agent.js
    components/
      agent-builder.js
      chat-lab.js
      automation-builder.js
      run-log-view.js
  data/
    db.json
  docs/
    BUBBY_MVP_BLUEPRINT.md
```

---

## 7) Tool Catalog für MVP

### Tool 1: `http_request`
- externe API/Webhook aufrufen
- GET/POST

### Tool 2: `send_webhook`
- einfacher Outbound Callback

### Tool 3: `file_store`
- kleine Textdateien lokal speichern/lesen

### Tool 4: `agent_memory_write`
- Fakten ins Agent-Memory speichern

### Tool 5: `agent_memory_search`
- Wissenseinträge durchsuchen

Wichtig:
- Tool-Whitelist pro Agent
- Standardmäßig alles aus
- Jede Tool-Ausführung loggen

---

## 8) Run Lifecycle

### Chat Run
1. User sendet Nachricht
2. Runtime lädt Agent + Conversation + Knowledge
3. Prompt Builder erzeugt Systemkontext
4. LLM Antwort / Tool Call
5. Tool Runner führt freigegebene Tools aus
6. Antwort finalisieren
7. Run Log speichern
8. UI aktualisieren

### Automation Run
1. Trigger feuert
2. Automation laden
3. Step für Step ausführen
4. optional Agent Run starten
5. Tool-Ergebnisse loggen
6. Erfolg/Fehler speichern

---

## 9) Was im bestehenden Projekt zuerst umgebaut wird

### Schon da
- Express Backend
- JSON DB
- Agenten-UI Grundgerüst
- Chat-Basis
- OpenClaw Export/Deploy Ansätze
- Public Agent Pages

### Jetzt zuerst umbauen

#### Schritt 1
`backend.js` entlasten:
- Runtime-Logik in `lib/runtime/*`
- Agent/Automation-Services auslagern

#### Schritt 2
DB erweitern:
- `automations`
- `runLogs`
- optional `toolCredentials`

#### Schritt 3
Agent-Modell schärfen:
- `goal`
- `persona`
- `tools`
- `memoryConfig`
- `deployConfig`

#### Schritt 4
Chat zu echtem Runtime-Flow machen:
- nicht nur Antwort generieren
- auch Tool Calls + Logs + Memory

#### Schritt 5
Automation Endpoints ergänzen:
- manual run
- webhook run
- cron-lite run

#### Schritt 6
UI reorganisieren:
- Agent Detail = echtes Studio
- eigener Logs Tab
- eigener Automation Tab

---

## 10) Empfohlene Bau-Reihenfolge

### Sprint 1
- Datenmodell schärfen
- Runtime extrahieren
- Agent Chat stabilisieren
- Knowledge sauber anbinden

### Sprint 2
- Tool Runner MVP
- Run Logs
- Tool Trace in UI

### Sprint 3
- Automation CRUD
- Webhook Trigger
- Manual Runs

### Sprint 4
- Cron-lite
- Deploy Tab
- OpenClaw Deploy robuster machen

---

## 11) Definition of Done für Bubby MVP

Bubby MVP ist fertig, wenn man in der App:
1. einen Agenten erstellt
2. seinen Stil/Zweck konfiguriert
3. Wissen hinzufügt
4. mit ihm chatten kann
5. mindestens 3 Tools aktivieren kann
6. eine Automation per Webhook oder manuell ausführen kann
7. Logs und Fehler sehen kann
8. den Agenten als OpenClaw-kompatiblen Export rauslassen kann

---

## 12) Harte Produktregel

**Erst Gehirn. Dann Make-up.**

Vor Design-Spielereien müssen diese Dinge stabil sein:
- Runtime
- Memory
- Tooling
- Automation
- Logs
