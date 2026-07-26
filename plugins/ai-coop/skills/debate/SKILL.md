---
name: debate
description: Dibattito iterativo Claude ↔ Codex (GPT-5) su un problema tecnico, con round alternati di proposta / review / challenge fino a convergenza su una soluzione condivisa. Usare quando l'utente scrive /debate, oppure chiede esplicitamente di "far confrontare Claude e Codex", "secondo parere iterativo", "dibattito tra modelli", "consenso tra i due modelli" su un problema di design, architettura, debugging o scelta tecnica.
---

# Debate: Claude ↔ Codex fino a consenso

Protocollo di dibattito strutturato fra il thread Claude principale e Codex (GPT-5),
con memoria di thread su entrambi i lati e criteri espliciti di terminazione.

## Canale verso Codex

Il dibattito lo orchestra **il thread principale**. Non delegarlo a un subagent e non usare
`Skill(codex:rescue)` o `codex:codex-rescue`: passano dal companion, che lega il thread alla
sessione Claude e lo perde alla chiusura.

### Primario — server MCP di Codex

Se i tool del server `codex` sono disponibili (`mcp__codex__codex` e `mcp__codex__codex-reply`;
cercali con ToolSearch se non compaiono), **preferiscili**: il processo resta vivo fra i round,
senza riavvio del binario e degli hook a ogni scambio.

- **Round 1** → tool `codex` con `{prompt, cwd: "<progetto>", sandbox: "read-only"}`.
  Restituisce `{threadId, content}`: annota `threadId` nel file di stato del dibattito.
- **Round successivi** → tool `codex-reply` con `{threadId, prompt}`.

Non risparmia token — i modelli sono stateless e ogni round rimanda comunque lo storico —
ma elimina secondi di overhead per scambio.

**Fallback obbligatorio.** Le sessioni MCP vivono solo in memoria nel processo server: se il
dibattito riprende in una sessione Claude successiva, `codex-reply` risponde
`Session not found`. Il thread non è perso — ricadi su
`codex exec resume <threadId> "<prompt>"` e prosegui da CLI per il resto del dibattito.
Un thread non creato dal server MCP corrente non è più raggiungibile via MCP: non riprovare.

### Fallback — `codex exec` via Bash

**Round 1 — apri la sessione del dibattito:**

```bash
cd <progetto> && codex exec -s read-only --json "<prompt round 1>" < /dev/null
```

Il primo evento JSONL è `{"type":"thread.started","thread_id":"..."}`. Annota quell'id:
è la memoria del dibattito.

**Round successivi — riprendi la stessa sessione:**

```bash
cd <progetto> && codex exec resume -o <debate-dir>/round-N.md <THREAD_ID> "<prompt>" < /dev/null
```

Senza continuità non c'è dibattito, solo review scollegate: al round 4 Codex deve poter
ricordare cosa sosteneva al round 1, altrimenti non può accorgersi che stai eludendo
un'obiezione.

Regole verificate:

- **`< /dev/null` sempre**, altrimenti il comando resta appeso in attesa di stdin.
- **`-s read-only` solo alla creazione**: `resume` non accetta il flag ed eredita la policy
  della sessione. Aprendo read-only, Codex non può toccare file per tutto il dibattito —
  garanzia della sandbox, non di una frase nel prompt.
- Le opzioni vanno **prima** del session id.
- **`-o <file>`** salva la risposta pulita: usalo per allegare gli interventi al file di stato.
- L'id della sessione va scritto nel file di stato del dibattito, così è riprendibile
  anche in una sessione Claude successiva.

## File di stato

Crea all'avvio `debate-<slug>.md` nella scratchpad di sessione (o nel progetto se l'utente lo chiede)
e aggiornalo **dopo ogni round**. È la memoria condivisa e ciò che l'utente legge.

```markdown
# Dibattito: <problema>

## Soluzione corrente (v<N>)
<la proposta viva in questo momento>

## Registro dei punti
| # | Punto | Stato | Chi l'ha sollevato | Esito |
|---|-------|-------|--------------------|-------|
| 1 | ...   | RISOLTO / APERTO / CONTESO | Claude / Codex | motivazione |

## Round <N> — <Claude propone | Codex critica>
**Argomenti accettati:** ... (e perché)
**Argomenti respinti:** ... (e perché)
**Nuovi punti aperti:** ...
```

Stati ammessi: `APERTO` (sollevato, non ancora affrontato), `RISOLTO` (accordo motivato),
`CONTESO` (disaccordo persistente ≥2 round → va escalato all'utente, non nascosto).

## Protocollo

### Round 0 — Claude: analisi e proposta
Analizza il problema e produci: assunzioni esplicite, vincoli, **almeno due** approcci
alternativi con trade-off, la proposta scelta e il perché, e i punti su cui sei meno sicuro.
Dichiarare le proprie incertezze è obbligatorio: è ciò che dà a Codex una presa reale.

### Round dispari — handoff a Codex
Lancia `codex exec` (round 1) o `codex exec resume` (successivi) con un prompt di questa forma:

```
Sei il revisore avversariale in un dibattito tecnico strutturato.

PROBLEMA: <enunciato>
PROPOSTA CORRENTE DI CLAUDE (v<N>): <testo integrale>
PUNTI ANCORA CONTESI: <elenco dal registro>

Rispondi in questo formato:
1. VERDETTO: accetto / accetto con modifiche / respingo
2. DIFETTI CONCRETI: per ciascuno — dove, perché fallisce, scenario di rottura
3. CONTROPROPOSTA: la tua soluzione o la modifica minima necessaria
4. ACCORDI: cosa della proposta di Claude ritieni corretto e perché
5. DOMANDE APERTE: cosa ti serve sapere per decidere

Non essere accomodante. Se non trovi difetti reali, dillo esplicitamente
invece di inventarne di marginali per sembrare utile.
```

### Round pari — Claude: challenge
Non accettare né respingere in blocco. Per **ogni** punto sollevato da Codex:
- se lo accetti, di' quale argomento ti ha convinto e aggiorna la soluzione;
- se lo respingi, motiva tecnicamente — non "resto della mia idea";
- se è una differenza di preferenza, non di correttezza, marcalo come tale e chiudilo.

Poi aggiungi almeno un elemento nuovo (idea, vincolo, caso limite non considerato),
incrementa la versione della soluzione e riparti.

## Regole anti-consenso-fasullo

Il rischio reale non è il loop infinito, è la **convergenza per compiacenza**.

- Il consenso vale solo se ogni punto del registro è `RISOLTO` **con motivazione scritta**.
- Un modello che cambia posizione deve nominare l'argomento che l'ha convinto.
  Cambio di idea senza motivo esplicito = punto ancora `APERTO`.
- Vietato chiudere un punto con "buona osservazione, hai ragione" e nulla più.
- Se dopo 2 round i due sono d'accordo su tutto ma nessuno ha mai cambiato posizione,
  è un segnale di dibattito superficiale: fai un round esplicito di *steelmanning*
  dell'alternativa scartata prima di dichiarare consenso.

## Terminazione

**Non esiste un tetto di round.** Il dibattito continua finché serve. Non chiudere mai
per numero di round raggiunto, per lunghezza della discussione o per costo: chiudi solo
quando una delle condizioni sostanziali qui sotto è verificata.

Fermati e riporta all'utente quando si verifica **una** di queste:

1. **Consenso** — nessun punto `APERTO` o `CONTESO`, e l'ultimo round non ne ha introdotti di nuovi.
2. **Rendimento nullo** — due round consecutivi in cui nessuno dei due produce un punto nuovo,
   una motivazione nuova o un cambio di posizione. La discussione è satura: continuare
   genererebbe solo riformulazioni. Questa è la vera condizione di arresto, non il conteggio.
3. **Stallo irriducibile** — un punto resta `CONTESO` dopo aver esaurito la procedura
   di sblocco qui sotto. Solo allora presenta all'utente le due posizioni con i rispettivi
   argomenti e chiedi a lui di decidere (`AskUserQuestion`).
4. **Dipendenza esterna** — il dibattito non può avanzare senza un dato che nessuno dei due
   possiede (un benchmark da eseguire, una decisione di prodotto, un vincolo non dichiarato).
   Dillo e chiedi.

### Procedura di sblocco (prima di dichiarare stallo)

Un punto `CONTESO` che persiste va attaccato, non archiviato. Nell'ordine:

1. **Isola l'assunzione divergente.** Due analisi corrette che divergono partono quasi sempre
   da premesse diverse, non da errori. Chiedi a entrambi di dichiarare l'assunzione che rende
   vera la propria posizione e falsa l'altra. Spesso il disaccordo evapora qui.
2. **Steelman incrociato.** Un round in cui ciascuno argomenta la posizione *dell'altro*
   nel modo più forte possibile. Se non riesci a farlo in modo convincente, non l'avevi capita.
3. **Test decisivo.** Formula l'esperimento, il benchmark o il caso limite concreto il cui
   esito distinguerebbe le due posizioni. Se è eseguibile, eseguilo e chiudi il punto sui fatti.
4. **Riclassifica.** Se dopo i passi sopra il disaccordo non riguarda la correttezza ma
   priorità, gusto o tolleranza al rischio, non è uno stallo tecnico: marcalo come scelta
   dell'utente e chiudilo.

Solo se tutti e quattro falliscono il punto è irriducibile.

### Durante un dibattito lungo

- Aggiorna `debate-<slug>.md` **dopo ogni round**, senza eccezioni: è ciò che rende il loop
  interrompibile senza perdere lavoro. L'utente può fermare con Esc in qualsiasi momento
  e ritrovare lo stato completo su file.
- Ogni 5 round, aggiungi al file una riga di sintesi `## Stato al round N` con i punti
  ancora aperti, così la traiettoria resta leggibile senza rileggere tutto.
- Se il registro cresce oltre ~10 punti aperti, il problema è troppo largo: proponi
  all'utente di scorporarlo in dibattiti separati invece di continuare su tutti i fronti.

## Output finale

1. **La soluzione concordata**, per intero e autoconsistente.
2. **Cosa è cambiato dalla v1** e per merito di quale argomento.
3. **Dissensi residui**, se ce ne sono, con entrambe le posizioni.
4. **Cosa nessuno dei due ha potuto verificare** (assunzioni non testate).
5. Il percorso del file `debate-<slug>.md`.

Solo dopo l'approvazione dell'utente si passa all'implementazione. L'implementazione
non fa parte del dibattito.
