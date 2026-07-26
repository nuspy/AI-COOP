# Architettura

## Perché non il plugin ufficiale

Il plugin [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) offre un canale
verso Codex tramite il subagent `codex:codex-rescue`, che inoltra a
`scripts/codex-companion.mjs task`. Funziona bene per scambi one-shot, ma ha un vincolo che
lo rende inadatto a un confronto prolungato.

Il companion registra i job con un `sessionId` preso da `CODEX_COMPANION_SESSION_ID`, che
corrisponde alla **sessione Claude Code corrente**. Il flag `--resume-last` cerca un thread
riprendibile dentro quella sessione:

```json
{
  "available": true,
  "sessionId": "6cda5e2d-3a00-4458-a557-29c1cf9e5f90",
  "candidate": { "threadId": "019f9bc8-9e9b-7a10-adb9-3fed77c5ab7a", "status": "completed" }
}
```

Chiusa la sessione Claude, il candidato non è più disponibile. Un dibattito o un ciclo di
sviluppo che si estende su più giorni perderebbe la memoria del confronto a ogni riavvio —
esattamente ciò che rende il confronto utile.

C'è un secondo motivo. Il subagent è un forwarder che restituisce lo stdout di Codex, ma
resta un intermediario: AI-COOP ha bisogno che l'output arrivi su file, non attraverso un
modello che potrebbe riassumerlo.

## Il canale, primario: server MCP

`codex mcp-server` avvia Codex come server MCP su stdio. Espone due tool:

| Tool | Input | Output |
|---|---|---|
| `codex` | `{prompt, cwd, sandbox, model, config, ...}` | `{threadId, content}` |
| `codex-reply` | `{threadId, prompt}` | `{threadId, content}` |

Stessa semantica di `exec` / `exec resume`, ma il processo resta vivo fra le chiamate e
l'output arriva già strutturato — niente parsing di JSONL, e `content` è pronto per il
journal verbatim.

Configurazione (inclusa nel plugin, `plugins/ai-coop/.mcp.json`):

```json
{ "mcpServers": { "codex": { "command": "codex", "args": ["mcp-server"] } } }
```

### Le sessioni MCP vivono in memoria

Vincolo verificato che determina la strategia: il server MCP mantiene i thread creati
**solo nel proprio processo**. Un server nuovo non ritrova le sessioni di quello precedente,
né quelle aperte da `codex exec`.

Le sessioni però *sono* su disco, e il CLI le legge tutte — comprese quelle nate via MCP.
L'interoperabilità è quindi a senso unico: **CLI → MCP no, MCP → CLI sì**.

Ne segue una strategia ibrida:

| Situazione | Canale |
|---|---|
| Interazioni entro la stessa sessione Claude Code | `codex-reply` (MCP) |
| Prima interazione dopo un riavvio | `codex exec resume <threadId>` |
| `codex-reply` risponde `Session not found` | ricadi su CLI e resta lì per quel thread |

Il `threadId` non si perde mai: cambia solo il canale con cui lo si raggiunge. Per `/forge`,
che dura giorni, il CLI resta la garanzia di continuità e l'MCP è l'acceleratore della
singola sessione.

### Cosa risparmia, e cosa no

**Non risparmia token.** I modelli sono stateless: ogni turno reinvia l'intero storico come
input, che il processo sia rimasto aperto o no. La "sessione viva" esiste nel processo Codex,
non nel modello. `codex-reply` e `codex exec resume` mandano all'API gli stessi token.

**Risparmia overhead di processo**: avvio del binario, caricamento config, autenticazione e
hook. Nei test ogni invocazione CLI eseguiva `SessionStart`, `UserPromptSubmit` e `Stop`;
con il server persistente `SessionStart` avviene una volta. Secondi per chiamata, che su un
ciclo `/forge` lungo diventano minuti.

Le leve reali sui token sono altrove: prompt caching lato OpenAI (automatico, ne beneficia
anche il resume da CLI), compattazione della conversazione (parametro `compact-prompt`),
e prompt più stretti.

## Il canale, fallback: `codex exec`

Quando il server MCP non è configurato, AI-COOP parla direttamente con il CLI dal thread
principale.

**Apertura della sessione** (una volta per progetto o per dibattito):

```bash
cd <repo> && codex exec -s read-only --json "<briefing>" < /dev/null
```

Il primo evento JSONL contiene l'identificativo da conservare:

```json
{"type":"thread.started","thread_id":"019f9bce-355f-7901-b804-771921713994"}
```

**Ogni interazione successiva:**

```bash
cd <repo> && codex exec resume -o .forge/tmp/last.md <THREAD_ID> "<prompt>" < /dev/null
```

La sessione vive su disco, indipendente dal processo che l'ha creata e dalla sessione Claude
Code. Verificato: un token memorizzato in un'invocazione viene ricordato in un processo
separato avviato dopo la chiusura del primo.

## Read-only come proprietà della sandbox

`-s read-only` si passa **solo all'apertura**: `codex exec resume` non accetta il flag ed
eredita la policy della sessione originale.

Questo è un vantaggio, non una limitazione. Aprendo la sessione read-only, Codex non può
modificare file per l'intera durata del protocollo — la garanzia è del processo, non di
un'istruzione nel prompt che il modello potrebbe interpretare male o ignorare.

In `/forge` il revisore resta così strutturalmente indipendente da ciò che rivede: chi ha
scritto il codice è il peggior giudice della sua qualità, e l'unico che scrive è Claude.

## I due livelli di memoria

| Livello | Cosa | Sopravvive a | Ruolo |
|---|---|---|---|
| Sessione Codex | `thread_id` su disco | riavvio, giorni | contesto conversazionale caldo |
| File `.forge/` | markdown + json | qualsiasi cosa | fonte di verità del progetto |

Il primo livello rende il confronto continuo invece che a compartimenti. Il secondo è
autorevole: se la sessione Codex viene archiviata o cancellata, il **briefing pack** la
ricostruisce dai file — charter, roadmap, milestone corrente, ultimi cicli, punti contesi.

Nessuna fase si considera conclusa prima di aver aggiornato i file. È ciò che rende ogni
protocollo interrompibile con Esc senza perdere lavoro.

## Orchestrazione

Il loop gira nel **thread principale** di Claude Code. Non è delegabile a un subagent: il
tool `Agent` non è esposto ai subagent forkati, e comunque un livello di indirezione in più
introdurrebbe parafrasi dove serve fedeltà.

Conseguenza da tenere presente: quando Codex "dirige", è Claude a interrogarlo e poi a
eseguirne l'indicazione. Il journal verbatim rende verificabile che l'indicazione sia stata
seguita, ma la garanzia resta procedurale.

## Punti di controllo umano

`/forge` in configurazione ad autonomia massima si ferma in sei casi:

1. approvazione del charter
2. modifica dei criteri di accettazione (cambio di contratto)
3. azioni irreversibili — commit, push, deploy, migrazioni, scritture fuori dal working tree
4. stallo irriducibile dopo la procedura di sblocco
5. drift conclamato — 3 cicli senza avvicinare un criterio del charter
6. verifica impossibile — nessun modo di dimostrare che un criterio è soddisfatto

Il quinto è quello che protegge dalla combinazione autonomia massima + scope aperto: se il
ciclo lavora ma non consegna, si ferma e lo dichiara invece di continuare a produrre.

## Note operative

- **`< /dev/null` sempre**: senza, `codex exec` resta appeso in attesa di stdin.
- Le opzioni vanno **prima** del session id: `codex exec resume [OPZIONI] <ID> "<prompt>"`.
- `--output-schema <file.json>` forza risposte conformi a uno JSON Schema. Non ancora
  sfruttato dai protocolli: è la strada per trasformare verdetti e registri da prosa a dati.
- L'effort si eredita da `~/.codex/config.toml`; override con `-c model_reasoning_effort=...`.
