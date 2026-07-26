---
name: forge
description: Ciclo di sviluppo end-to-end guidato dal confronto Claude ↔ Codex (GPT-5). Dato un obiettivo di prodotto, i due modelli concordano charter e roadmap, poi iterano — Codex dirige e rivede, Claude implementa — con dibattito su ogni piano e review avversariale su ogni implementazione, fino al completamento dei criteri di accettazione. Usare quando l'utente scrive /forge, oppure chiede di "sviluppare un prodotto con Claude e Codex insieme", "ciclo autonomo di sviluppo a due modelli", "far dirigere lo sviluppo a Codex", "sviluppo e2e Claude Codex".
---

# Forge: sviluppo end-to-end Claude ↔ Codex

Ciclo di sviluppo in cui la direzione emerge dal confronto fra due modelli invece che
dall'umano. Claude implementa, Codex dirige e critica, l'umano supervisiona.

## Configurazione operativa (decisa dall'utente — non modificare senza chiederglielo)

- **Autonomia: massima.** Fermati solo per (a) approvazione del charter, (b) azioni
  irreversibili, (c) stallo irriducibile. Fra una milestone e l'altra **non** chiedere permesso.
- **Scope: aperto.** Le estensioni su cui Claude e Codex convergono entrano automaticamente
  nel backlog, senza approvazione umana. Ma vedi *Charter chiuso* qui sotto.
- **Implementazione: solo Claude.** Codex resta sempre read-only: analizza, dirige, critica,
  non tocca i file. Il revisore deve restare indipendente da ciò che rivede.

### Charter chiuso (il vincolo che tiene insieme il tutto)

Lo scope aperto vale sui **task**, mai sui **criteri di accettazione**.

- Un'estensione può aggiungere task al backlog: procedi senza chiedere.
- Un'estensione che richiede di modificare, aggiungere o rimuovere un criterio di
  accettazione del charter **è un cambio di contratto**: fermati e chiedi all'utente.
- Il prodotto è finito quando i criteri del charter passano, **indipendentemente** da quante
  estensioni sono state accumulate. Le estensioni non spostano il traguardo.
- Priorità di lavorazione: i task che servono un criterio del charter vengono **sempre** prima
  delle estensioni. Un'estensione si lavora solo quando la milestone corrente è verde.

## Canale verso Codex

**Non** usare il subagent `codex:codex-rescue` né `Skill(codex:rescue)`: passano dal
companion, che aggancia il thread alla sessione Claude Code e lo perde alla chiusura.

### Primario — server MCP di Codex

Se i tool del server `codex` sono disponibili (nomi tipici `mcp__codex__codex` e
`mcp__codex__codex-reply`; cercali con ToolSearch se non compaiono), **preferiscili**.
Il processo Codex resta vivo fra le chiamate, evitando avvio del binario, autenticazione e
hook a ogni interazione: secondi per chiamata, minuti su un ciclo lungo.

- **Apertura sessione** → tool `codex` con `{prompt, cwd: "<repo>", sandbox: "read-only"}`.
  Restituisce `{threadId, content}`: salva `threadId` in `.forge/state.json` come `codexThreadId`.
- **Interazioni successive** → tool `codex-reply` con `{threadId, prompt}`.

L'output è già strutturato: nessun parsing di stdout, e `content` va nel journal verbatim.

**Nota sui token.** Il server persistente non riduce il consumo: i modelli sono stateless e
ogni turno reinvia comunque lo storico, esattamente come il resume da CLI. Risparmia tempo,
non token. Sulle sessioni lunghe le leve reali sono il prompt caching (automatico) e la
compattazione della conversazione.

### Fallback — `codex exec` via Bash

Se il server MCP non è configurato, usa il CLI dal thread principale. Stesso comportamento e
stessa persistenza su disco, solo più lento per l'avvio ripetuto.

**Creazione della sessione di progetto** — una sola volta, in Fase 0:

```bash
cd <repo> && codex exec -s read-only --json "<briefing + primo prompt>" < /dev/null
```

Il primo evento JSONL è `{"type":"thread.started","thread_id":"..."}`. Estrai quell'id e
salvalo in `.forge/state.json` come `codexThreadId`: **è la memoria di Codex per l'intero
progetto**, valida anche fra sessioni Claude diverse e a distanza di giorni.

**Ogni interazione successiva:**

```bash
cd <repo> && codex exec resume -o .forge/tmp/last.md <THREAD_ID> "<prompt>" < /dev/null
```

Regole verificate sul campo:

- **`< /dev/null` sempre.** Senza, il comando resta appeso in attesa di stdin.
- **`-s`/`--sandbox` si passa solo alla creazione.** `codex exec resume` non lo accetta:
  eredita la policy della sessione originale. Creando con `-s read-only`, ogni resume resta
  read-only — la garanzia è della sandbox, non di una frase nel prompt che il modello
  potrebbe ignorare.
- **`-o <file>`** scrive la risposta finale pulita su file: usalo per il journal verbatim.
- **`--output-schema <file.json>`** forza una risposta JSON conforme a uno schema: usalo per
  verdetti di review e registri dei punti, così diventano dati e non prosa da interpretare.
- Le opzioni vanno **prima** del session id: `codex exec resume [OPZIONI] <ID> "<prompt>"`.
- Effort supportati dal modello configurato: `none`, `low`, `medium`, `high`, `xhigh`
  (non `minimal`). Senza `-c model_reasoning_effort=...` eredita `~/.codex/config.toml`.
- Se il resume fallisce (sessione archiviata o cancellata), ricrea la sessione con il
  briefing pack e aggiorna `codexThreadId`.

Per i dibattiti usa il protocollo dello skill **`debate`** (nessun tetto di round, procedura
di sblocco, registro dei punti). Non reimplementarlo qui.

## Memoria e continuità

Due livelli, entrambi necessari:

1. **Sessione Codex** (`codexThreadId`) — il contesto conversazionale caldo. Persiste su
   disco fra sessioni Claude. È l'ottimizzazione che rende il confronto continuo invece
   che a compartimenti.
2. **File `.forge/`** — la fonte di verità del progetto. Restano autorevoli anche se la
   sessione Codex viene persa, e permettono di ricostruirla da zero.

Non fidarti del solo livello 1: una sessione può essere archiviata o cancellata. Ogni fase
aggiorna i file **prima** di considerarsi conclusa.

**Briefing pack** — da usare alla creazione della sessione, o per ricrearla dopo una perdita:

```
CONTESTO DEL PROGETTO (ricostruzione, il thread precedente non è disponibile)
- CHARTER: <charter.md integrale>
- ROADMAP: <milestone e stato>
- MILESTONE CORRENTE: <nome> — criteri ancora aperti: <elenco>
- ULTIMI 3 CICLI: <dal journal: task, esito, decisioni chiave>
- BACKLOG IN TESTA: <prossimi 5 task>
- PUNTI ANCORA CONTESI: <dal registro>
```

## Artefatti

Tutti in `.forge/` nella root del repo. Aggiornali **prima** di terminare ogni fase:
è ciò che rende il ciclo interrompibile con Esc senza perdere lavoro.

| File | Contenuto |
|---|---|
| `charter.md` | Obiettivo, criteri di accettazione misurabili, non-goals, vincoli. Modificabile solo dall'utente |
| `roadmap.md` | Milestone con criteri di completamento verificabili e stato |
| `backlog.md` | Task ordinati: id, titolo, milestone, stato, proposto-da, criterio servito |
| `journal.md` | Un blocco per ciclo: task, piano, esito verifica, review Codex **verbatim**, decisioni |
| `ideas.md` | Estensioni proposte con motivazione e criterio servito; log delle ammissioni automatiche |
| `state.json` | `{fase, milestoneCorrente, taskCorrente, ultimoAggiornamento}` per il resume preciso |

`journal.md` deve contenere l'output di Codex **testuale e non parafrasato**. È l'unico modo
in cui l'utente può verificare che la direzione di Codex sia stata rispettata e non addolcita.

## Sotto-comandi

- `/forge <obiettivo>` — avvia un nuovo ciclo (Fase 0)
- `/forge continue` — riprende da `state.json`
- `/forge status` — riepilogo: milestone, criteri aperti, backlog in testa, dissensi
- `/forge ideas` — mostra il parcheggio estensioni

---

# Le fasi

## Fase 0 — Charter

Una sola volta, all'avvio. È la fase più importante: definisce **cosa significa finito**.
Senza criteri misurabili il ciclo non termina mai.

1. Raccogli l'obiettivo dall'utente. Se è vago, chiedi *solo* ciò che serve a rendere
   verificabili i criteri — non fare un'intervista di requisiti.
2. Redigi la bozza: obiettivo in una frase, **criteri di accettazione misurabili**
   (verificabili da un comando, non da un'opinione), non-goals espliciti, vincoli tecnici,
   definizione di "v1 finita".
3. Dibattito con Codex sul charter. Chiedigli esplicitamente: quali criteri non sono
   verificabili? cosa manca perché il prodotto sia utile? quali non-goals stai dando per
   scontati e andrebbero scritti?
4. **GATE UMANO OBBLIGATORIO**: presenta il charter e chiedi approvazione. Non procedere senza.

Un criterio è valido solo se esiste un modo automatico di dire se passa. `"l'API risponde in
meno di 200ms al p95 sotto 100 req/s"` è un criterio. `"l'app è veloce"` non lo è.

## Fase 1 — Roadmap

Dibattito sulla decomposizione in milestone. Ogni milestone ha criteri di completamento
verificabili e mappa su almeno un criterio del charter. Una milestone che non serve nessun
criterio del charter non deve esistere: segnalalo.

Scrivi `roadmap.md` e passa alla Fase 2 senza chiedere conferma.

## Fase 2 — Ciclo di task

Si ripete fino al completamento. Ogni passaggio aggiorna gli artefatti.

### 2a. Direzione (Codex)

Chiedi a Codex di scegliere il prossimo task e motivarlo:

```
Sei il direttore tecnico di questo sviluppo.
STATO: <milestone corrente, criteri aperti, backlog, ultimi 3 cicli>

Scegli il PROSSIMO TASK e rispondi:
1. TASK: cosa va fatto, in una frase
2. PERCHÉ ORA: quale criterio del charter serve e perché prima degli altri
3. CRITERI DI ACCETTAZIONE: come si verifica che è fatto
4. RISCHI: cosa può andare storto
```

Se dissenti sulla scelta, apri un mini-dibattito. Se Codex sceglie un'estensione mentre la
milestone corrente ha criteri aperti, contestalo: la priorità è fissata dal charter.

### 2b. Piano di task

Dibattito su **cosa** e **come**. Output: approcci considerati, scelta motivata, criteri di
accettazione, e i test che li verificano. Il piano non è approvato finché non esiste un modo
di dimostrare che il task è completo.

### 2c. Implementazione

Claude implementa. Codex non tocca nulla. Segui le convenzioni del repo esistente.

### 2d. Verifica oggettiva

Esegui test, build, lint, type-check — quello che il progetto ha.

- Rosso → torna a 2c. Non passare alla review con la verifica rossa.
- **Se il progetto non ha test, questa fase è cieca.** Dichiaralo nel journal, e proponi
  di aggiungere copertura come task del backlog. Due modelli possono concordare
  entusiasticamente su codice che non funziona: i test sono l'unico ancoraggio ai fatti.

### 2e. Challenge review

Codex rivede il diff — che a questo punto **già passa i test**, quindi la critica verte su
design e robustezza, non su bug che una macchina trova meglio.

```
Review avversariale. Il codice passa già i test.
TASK: <...>   PIANO CONCORDATO: <...>   DIFF: <...>

1. VERDETTO: accetto / accetto con modifiche / respingo
2. DIFETTI: dove, perché fallisce, scenario concreto di rottura
3. COSA MANCA: casi limite, errori non gestiti, assunzioni non verificate
4. DEBITO INTRODOTTO: cosa costerà caro dopo
5. COSA È FATTO BENE e perché

Non essere accomodante. Se non trovi difetti reali dillo, invece di inventarne
di marginali per sembrare utile.
```

Dibattito fino a soddisfazione mutua (protocollo `debate`). Ogni difetto accettato diventa
una correzione, ogni difetto respinto va motivato tecnicamente nel journal.

### 2f. Chiusura del ciclo

1. Aggiorna `journal.md` (con l'output Codex verbatim), `backlog.md`, `state.json`.
2. **Controllo di drift**: il lavoro appena fatto serve ancora un criterio del charter?
   Se negli ultimi 3 cicli nessuno ha avvicinato un criterio del charter, fermati e dillo
   all'utente: il ciclo sta lavorando ma non sta consegnando.
3. Se la milestone è completa, valuta la Fase 3. Altrimenti torna a 2a **senza chiedere**.

## Fase 3 — Innovazione

A fine milestone, non a ogni task.

Entrambi propongono estensioni, nuovi use case, refactor, miglioramenti — a partire da ciò
che si è imparato implementando, non da speculazioni astratte.

Per ogni proposta, dibattito breve e classificazione:

- **Serve un criterio del charter** → entra nel backlog automaticamente. Registra in
  `ideas.md` chi l'ha proposta, il criterio servito e la data di ammissione.
- **Non serve nessun criterio ma è compatibile** → entra nel backlog in coda alle estensioni,
  lavorabile solo a milestone verde.
- **Richiede di cambiare i criteri del charter** → **STOP, chiedi all'utente.** È un cambio
  di contratto, non un'estensione.

Non proporre estensioni all'infinito: se un round di innovazione produce più di 5 idee,
tenete le 3 con il rapporto valore/costo migliore e archiviate il resto in `ideas.md`.

## Fase 4 — Terminazione

Il prodotto è finito quando **tutti i criteri di accettazione del charter passano, verificati
da un'esecuzione reale** — non quando i due modelli sono soddisfatti.

Alla chiusura produci un rapporto: criteri e come sono stati verificati, cosa è cambiato dal
charter iniziale e per merito di quale argomento, estensioni ammesse durante il percorso,
dissensi mai risolti, e cosa nessuno dei due ha potuto verificare.

Se restano estensioni in `ideas.md`, elencale come proposta per la v2 — senza iniziarle.

---

# Punti di arresto obbligatori

Fermati e chiedi all'utente **solo** in questi casi:

1. **Approvazione del charter** (Fase 0).
2. **Modifica dei criteri di accettazione** — cambio di contratto.
3. **Azioni irreversibili**: commit, push, deploy, migrazioni distruttive, cancellazioni,
   modifiche a infrastruttura remota, qualunque scrittura fuori dal working tree.
4. **Stallo irriducibile** dopo la procedura di sblocco dello skill `debate`.
5. **Drift conclamato**: 3 cicli senza avvicinare un criterio del charter.
6. **Verifica impossibile**: nessun modo di dimostrare che un criterio è soddisfatto.

In tutti gli altri casi procedi. L'utente ha scelto la massima autonomia: chiedere conferma
per cose già decise nel charter è rumore, non prudenza.
