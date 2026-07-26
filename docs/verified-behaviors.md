# Comportamenti verificati sul campo

Registro empirico dei test eseguiti contro `codex-cli 0.145.0` su Windows 11, Node v24.14.0,
modello `gpt-5.6-sol`. Serve a distinguere ciò che è stato **osservato** da ciò che è
plausibile: i protocolli poggiano su queste proprietà, e se una versione futura del CLI le
cambia, vanno rifatti i test.

Data verifica: 2026-07-26.

---

## ✅ Il resume sopravvive al processo

**Test.** Sessione creata in un'invocazione, ripresa in una successiva e separata.

```bash
codex exec -s read-only --skip-git-repo-check --json "Memorizza questo token: ALFA-42. Rispondi solo OK." < /dev/null
# → {"type":"thread.started","thread_id":"019f9bce-355f-7901-b804-771921713994"}

codex exec resume --skip-git-repo-check 019f9bce-355f-7901-b804-771921713994 \
  "Quale token ti ho chiesto di memorizzare? Rispondi solo con il token." < /dev/null
# → ALFA-42
```

**Esito.** Confermato. È la proprietà su cui poggia l'intero progetto: senza, ogni scambio
ripartirebbe da zero e non ci sarebbe confronto ma solo review scollegate.

---

## ✅ Il `thread_id` è il primo evento JSONL

Con `--json`, l'evento di apertura è sempre il primo della sequenza:

```json
{"type":"thread.started","thread_id":"..."}
{"type":"turn.started"}
```

Estrazione affidabile:

```bash
codex exec --json "<prompt>" < /dev/null 2>/dev/null \
  | grep -o '"thread_id":"[^"]*"' | head -1 | cut -d'"' -f4
```

---

## ✅ `resume` rifiuta `-s/--sandbox`

```
$ codex exec resume -s read-only <ID> "..."
error: unexpected argument '-s' found
```

La policy di sandbox è fissata all'apertura della sessione e non è più modificabile.

**Implicazione sfruttata dai protocolli:** aprendo con `-s read-only`, Codex resta read-only
per tutta la vita della sessione senza doverlo ripetere a ogni prompt.

**⚠️ Non verificato direttamente:** che il resume *erediti effettivamente* la policy
read-only, anziché ricadere sul default della config. È l'inferenza logica dal rifiuto del
flag, ma manca un test che provochi un tentativo di scrittura e ne osservi il blocco.
Da confermare al primo uso reale prima di trattarlo come garanzia di sicurezza.

---

## ✅ Le opzioni vanno prima del session id

`Usage: codex exec resume [OPTIONS] [SESSION_ID] [PROMPT]` — l'ordine è vincolante,
un'opzione dopo l'id viene interpretata come argomento.

---

## ✅ Serve `< /dev/null`

Senza redirezione, `codex exec` stampa `Reading additional input from stdin...` e resta in
attesa indefinita. In automazione blocca il comando fino al timeout.

---

## ✅ Effort supportati

```
'minimal' is not supported with the 'gpt-5.6-sol-1p-codexswic-ev3' model.
Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'.
```

`minimal` esiste per altri modelli ma non per questo. Senza `-c model_reasoning_effort=...`
si eredita `~/.codex/config.toml`.

---

## ✅ Il server MCP espone `codex` e `codex-reply`

**Test.** Handshake JSON-RPC su stdio contro `codex mcp-server`.

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"probe","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' | codex mcp-server
```

**Esito.** `serverInfo: codex-mcp-server 0.145.0`, due tool:

- `codex` — avvia una sessione. Accetta `prompt` (obbligatorio), `cwd`, `sandbox`
  (`read-only` | `workspace-write` | `danger-full-access`), `model`, `approval-policy`,
  `base-instructions`, `developer-instructions`, `compact-prompt`, `config`.
  Output schema: `{threadId, content}`.
- `codex-reply` — continua da `{threadId, prompt}`. Stesso output schema.

Nota: `sandbox` è accettato solo da `codex`, non da `codex-reply` — stessa asimmetria del CLI.

Attenzione nel sondare il server a mano: chiudendo stdin subito dopo il `tools/call`, il
processo termina prima di completare il turno. Serve un client che tenga la connessione
aperta fino alla risposta.

---

## ⚠️ Le sessioni MCP vivono in memoria — l'interoperabilità è asimmetrica

Il risultato più importante per il design dei protocolli. Tre test:

| Direzione | Esito |
|---|---|
| Server MCP nuovo → thread creato da un **precedente** server MCP | ❌ `Session not found` |
| Server MCP → thread creato da `codex exec` | ❌ `Session not found` |
| `codex exec resume` → thread creato via MCP | ✅ risponde correttamente |

**Test.** Sessione aperta via MCP (`019f9c1c-b73b-7283-8bd0-b62f45bd36a8`, token `BETA-77`),
poi interrogata da un processo server nuovo e, separatamente, dal CLI.

```
node mcp-probe.mjs reply 019f9c1c-... "Quale token?"
→ {"isError": true, "content": "Session not found for thread_id: 019f9c1c-..."}

codex exec resume 019f9c1c-... "Quale token?"
→ BETA-77
```

**Interpretazione.** Le sessioni *sono* persistite su disco — il CLI le legge tutte,
comprese quelle aperte via MCP. Ma il server MCP mantiene una mappa **solo in memoria** dei
thread creati nel proprio processo, e non ricarica da disco: `codex-reply` funziona
esclusivamente entro la vita di quel processo.

**Conseguenza per i protocolli.** Strategia ibrida con fallback:

- Dentro una sessione Claude Code il server MCP resta vivo, quindi `codex-reply` è valido
  e conviene per la latenza.
- Alla chiusura di Claude Code il server muore e il `threadId` diventa irraggiungibile
  via MCP — ma **non è perso**: `codex exec resume <threadId>` lo recupera.
- Quando `codex-reply` risponde `Session not found`, ricadere su `codex exec resume` e
  proseguire su quel canale per il resto del thread. Non c'è modo di far riadottare al
  server MCP un thread che non ha creato.

Per `/forge`, che dura giorni, questo significa che il CLI resta la garanzia di continuità;
l'MCP è l'acceleratore per la singola sessione.

---

## ❌ Il server MCP non riduce il consumo di token

Assunzione da smentire esplicitamente perché intuitiva e sbagliata: tenere il processo Codex
aperto **non** evita il reinvio del contesto. I modelli sono stateless — ogni turno rimanda
l'intero storico come input, che il processo sia vivo o no. La sessione persiste nel processo
Codex, non nel modello.

Il risparmio è di **overhead di processo**, non di token: negli output CLI si osserva
`hook: SessionStart`, `hook: UserPromptSubmit`, `hook: Stop` a ogni singola invocazione,
oltre ad avvio del binario e autenticazione.

---

## ✅ Il companion lega il thread alla sessione Claude

```bash
node "$CLAUDE_PLUGIN_ROOT/scripts/codex-companion.mjs" task-resume-candidate --json
```

```json
{
  "available": true,
  "sessionId": "6cda5e2d-3a00-4458-a557-29c1cf9e5f90",
  "candidate": { "threadId": "019f9bc8-...", "status": "completed" }
}
```

Il `sessionId` restituito coincide con quello della sessione Claude Code in corso. Lo stato
dei job è persistito per workspace (`state.json` + `jobs/`, max 50 job), ma il *candidato al
resume* è filtrato per sessione.

**Motivo per cui AI-COOP non usa il companion.**

---

## Da verificare

- [ ] Ereditarietà effettiva della sandbox read-only al resume (vedi sopra)
- [ ] `--output-schema` con schema complesso: aderenza e comportamento su violazione
- [ ] Durata di vita delle sessioni Codex su disco: esiste una scadenza o un limite di numero?
- [ ] Comportamento di `resume` su sessione archiviata con `codex archive`
- [ ] Se `-C/--cd` è accettato da `exec resume` (i protocolli usano `cd` per sicurezza)
- [ ] Se le sessioni possono essere nominate alla creazione — `resume` accetta un "thread name"
      oltre all'UUID, ma il meccanismo per assegnarlo non è documentato nell'help
