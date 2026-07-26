# AI-COOP

**Cooperazione avversariale fra Claude e Codex.** Due modelli che si confrontano invece di
obbedire, con protocolli che rendono il disaccordo produttivo anziché decorativo.

---

## Il problema

Gli assistenti di codice sono addestrati a essere utili e collaborativi. Questo li rende
pessimi revisori di sé stessi: accettano la premessa della domanda, difendono la soluzione
che hanno appena scritto, e convergono verso l'accordo perché l'accordo è ciò che sembra
utile.

Mettere due modelli diversi sullo stesso problema aiuta — Claude e Codex hanno punti ciechi
diversi — ma non basta. Due modelli collaborativi lasciati liberi convergono per cortesia
dopo un round: *"ottima osservazione, hai ragione"*, e il confronto finisce prima di
cominciare. Il risultato sembra una revisione approfondita e non lo è.

**AI-COOP è il protocollo che impedisce questo esito.**

## L'idea

Il confronto produce valore solo se strutturato. Tre vincoli lo rendono reale:

1. **Memoria del confronto.** Ogni scambio riprende la stessa sessione Codex, così al round 4
   il revisore ricorda cosa sosteneva al round 1 e può accorgersi che un'obiezione è stata
   elusa invece che risolta.
2. **Contabilità dei disaccordi.** Ogni punto entra in un registro con stato esplicito.
   Il consenso si dichiara quando il registro è pulito, non quando l'atmosfera è cordiale.
3. **Ancoraggio ai fatti.** Test verdi prima della critica. Due modelli possono concordare
   entusiasticamente su codice che non funziona: solo un'esecuzione reale lo smentisce.

## I due protocolli

### `/debate` — portare due modelli al consenso su una decisione

Round alternati: Claude analizza e propone, Codex critica in modo avversariale, Claude
risponde punto per punto, e si continua. Nessun tetto di round: si finisce per consenso
motivato o per saturazione, mai per conteggio.

Quando un disaccordo persiste, prima di scaricarlo sull'umano passa per quattro tentativi
di sblocco: isolare l'assunzione divergente, steelman incrociato, formulare il test decisivo,
riclassificare come scelta di preferenza. La maggior parte dei disaccordi apparenti si
dissolve al primo passo — due analisi corrette che divergono partono quasi sempre da premesse
diverse, non da errori.

```
/debate il backtest ha look-ahead bias sui volumi. Come lo elimino senza riscrivere il data loader?
```

### `/forge` — costruire un prodotto end-to-end

Ciclo di sviluppo in cui la direzione emerge dal confronto invece che dall'umano. Codex
dirige e rivede, Claude implementa, l'umano supervisiona.

```
Fase 0  Charter       obiettivo + criteri di accettazione misurabili  → APPROVAZIONE UMANA
Fase 1  Roadmap       milestone concordate
Fase 2  Ciclo         direzione → piano → implementazione → test → review → chiusura
Fase 3  Innovazione   estensioni proposte da entrambi, a fine milestone
Fase 4  Terminazione  tutti i criteri del charter passano su esecuzione reale
```

```
/forge un servizio di inferenza vLLM per segnali forex, API OpenAI-compatibile, 50 richieste concorrenti
```

Il ciclo è interrompibile e riprendibile: `/forge continue`, `/forge status`.

## Charter chiuso, scope aperto

Il meccanismo che impedisce a un ciclo autonomo di non finire mai.

Due modelli creativi che si stimolano a vicenda generano estensioni all'infinito, tutte
plausibili. AI-COOP separa i due piani:

- **I task sono aperti.** Le estensioni su cui i due convergono entrano da sole nel backlog.
- **I criteri di accettazione sono chiusi.** Modificarli è un cambio di contratto e richiede
  l'umano.

Il prodotto è finito quando i criteri del charter passano, quante che siano le estensioni
accumulate lungo la strada. Il percorso si arricchisce, il traguardo non si sposta.

## Requisiti

| | |
|---|---|
| Claude Code | con supporto skill |
| [Codex CLI](https://github.com/openai/codex) | `npm install -g @openai/codex` |
| Account OpenAI | abbonamento ChatGPT (anche Free) o API key |
| Node.js | ≥ 18.18 |

Il plugin ufficiale [openai/codex-plugin-cc](https://github.com/openai/codex-plugin-cc) **non**
è richiesto: AI-COOP parla direttamente con `codex exec` per avere sessioni persistenti che
il companion non offre. Vedi [docs/architecture.md](docs/architecture.md).

## Installazione

**Come marketplace Claude Code** (in una sessione interattiva `claude`):

```
/plugin marketplace add E:\projects\AI-COOP
/plugin install ai-coop@ai-coop
/reload-plugins
```

**Oppure come skill locali** — scoperti automaticamente, nessun reload:

```powershell
.\scripts\install-local.ps1
```

Durante lo sviluppo dei protocolli conviene `-Link`, che crea junction verso il repo invece
di copie: le modifiche diventano attive immediatamente.

### Server MCP di Codex (consigliato)

Il plugin dichiara il server in `plugins/ai-coop/.mcp.json`: installandolo da marketplace
viene configurato da solo. Con l'installazione locale degli skill va aggiunto a mano:

```bash
claude mcp add codex -- codex mcp-server
```

I protocolli funzionano anche senza — ricadono su `codex exec` — ma con il server il processo
Codex resta vivo fra le chiamate, risparmiando avvio del binario e hook a ogni scambio.
**Non riduce il consumo di token**: i modelli sono stateless e ogni turno reinvia comunque lo
storico. Risparmia tempo, non token.

## Uso

Lancia sempre dalla directory del progetto: Codex ragiona sulla working directory.

```bash
cd C:\Projects\ForexGPT
```

| Comando | Cosa fa |
|---|---|
| `/debate <problema>` | dibattito fino a consenso su una decisione |
| `/forge <obiettivo>` | avvia un ciclo di sviluppo completo |
| `/forge continue` | riprende dal punto salvato |
| `/forge status` | milestone, criteri aperti, dissensi |
| `/forge ideas` | parcheggio delle estensioni proposte |

## Artefatti prodotti

`/debate` scrive `debate-<slug>.md`: la soluzione viva, il registro dei punti, e cosa ha
convinto chi a cambiare posizione.

`/forge` scrive in `.forge/`:

| File | Ruolo |
|---|---|
| `charter.md` | obiettivo e criteri di accettazione — modificabile solo dall'umano |
| `roadmap.md` | milestone con criteri verificabili |
| `backlog.md` | task del charter (priorità) ed estensioni |
| `journal.md` | un blocco per ciclo, con l'output Codex **verbatim** |
| `ideas.md` | estensioni proposte e log delle ammissioni |
| `state.json` | fase, task corrente, id sessione Codex, contatore anti-drift |

Il journal riporta l'output di Codex non parafrasato: è l'unico modo per verificare che la
direzione sia stata rispettata e non addolcita da chi la esegue.

## Limiti noti

**Codex non dirige davvero.** Solo il thread principale può orchestrare il loop, quindi
quando Codex "assegna il task successivo" è Claude a chiederglielo e poi a eseguirlo.
Funzionalmente equivalente finché l'output viene rispettato — e il journal verbatim esiste
proprio per rendere verificabile che lo sia. Ma la garanzia è procedurale, non architetturale.

**Senza test la verifica è cieca.** Su progetti senza copertura automatica il ciclo perde
il suo ancoraggio ai fatti e può convergere su codice rotto con grande convinzione.
`/forge` lo dichiara nel journal e propone di aggiungere copertura, ma non può sostituirla.

**Costo e latenza.** Il modello Codex gira all'effort configurato in `~/.codex/config.toml`.
A `xhigh` la qualità del confronto è massima e ogni round richiede minuti. Un prodotto reale
significa ore su più sessioni.

## Stato

`0.1.0` — protocolli definiti e canale verificato empiricamente
([docs/verified-behaviors.md](docs/verified-behaviors.md)). Non ancora validato su un ciclo
`/forge` completo end-to-end.

## Licenza

Da definire.
