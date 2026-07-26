# Template degli artefatti `.forge/`

Crea questi file in Fase 0/1. Mantieni la struttura: il ciclo li rilegge per ricostruire
lo stato quando il thread Codex non è più disponibile.

---

## `charter.md`

```markdown
# Charter — <nome prodotto>

**Approvato da:** <utente> il <data>
**Stato:** vincolante — modificabile solo con approvazione esplicita dell'utente

## Obiettivo
<una frase. Cosa esiste alla fine che non esiste ora.>

## Criteri di accettazione
Ogni criterio deve essere verificabile da un comando, non da un'opinione.

| # | Criterio | Come si verifica | Stato |
|---|----------|------------------|-------|
| C1 | ... | `pytest tests/test_x.py` | APERTO / PASSA |
| C2 | ... | build completa senza errori | APERTO |

## Non-goals
Cosa questo prodotto esplicitamente NON fa. Serve a respingere le estensioni fuori scope.
- ...

## Vincoli
Tecnici, di piattaforma, di dipendenze, di performance.
- ...

## Definizione di "v1 finita"
Tutti i criteri sopra passano su un'esecuzione reale.
```

---

## `roadmap.md`

```markdown
# Roadmap

| # | Milestone | Criteri charter serviti | Completamento verificabile | Stato |
|---|-----------|-------------------------|----------------------------|-------|
| M1 | ... | C1, C2 | ... | IN CORSO |
| M2 | ... | C3 | ... | DA FARE |

## M1 — <nome>
**Fatta quando:** <condizione verificabile>
**Concordata il:** <data> — dibattito in `debate-roadmap.md`
```

---

## `backlog.md`

```markdown
# Backlog

## Task del charter (priorità assoluta)
| id | Task | Milestone | Criterio | Proposto da | Stato |
|----|------|-----------|----------|-------------|-------|
| T1 | ... | M1 | C1 | Codex | FATTO |
| T2 | ... | M1 | C1 | Claude | IN CORSO |

## Estensioni (solo a milestone verde)
| id | Task | Origine | Ammessa il | Stato |
|----|------|---------|------------|-------|
| E1 | ... | Fase 3 dopo M1 | <data> | DA FARE |
```

Stati: `DA FARE`, `IN CORSO`, `IN REVIEW`, `FATTO`, `ABBANDONATO` (con motivo).

---

## `journal.md`

Un blocco per ciclo, in ordine cronologico inverso (il più recente in alto).

```markdown
## Ciclo <N> — <task id>: <titolo>
**Data:** <data> | **Milestone:** M1 | **Criterio servito:** C1

### Direzione (Codex)
> <output di Codex VERBATIM, non parafrasato>

### Piano concordato
<approccio scelto e perché; alternative scartate>

### Implementazione
<file toccati, scelte non ovvie>

### Verifica
<comando eseguito ed esito reale. Se non c'erano test, dirlo esplicitamente.>

### Review (Codex)
> <output VERBATIM>

### Esito del dibattito
- Accettato: <difetto> → corretto perché <argomento che ha convinto>
- Respinto: <difetto> → motivo tecnico
- Conteso: <punto> → stato

### Drift check
Questo ciclo ha avvicinato C1? <sì/no + come>
```

L'output di Codex va riportato **testuale**. È l'unico modo per l'utente di verificare che
la direzione non sia stata addolcita o ignorata.

---

## `ideas.md`

```markdown
# Estensioni proposte

## Ammesse automaticamente
| Idea | Proposta da | Criterio servito | Ammessa il | Task |
|------|-------------|------------------|------------|------|
| ... | Codex | C2 | <data> | E1 |

## In attesa (compatibili, nessun criterio servito)
| Idea | Proposta da | Valore | Costo stimato |
|------|-------------|--------|---------------|
| ... | Claude | ... | ... |

## Richiedono modifica del charter — SERVE L'UTENTE
| Idea | Cosa cambierebbe nel charter | Proposta il |
|------|------------------------------|-------------|
| ... | aggiungerebbe il criterio C5 | <data> |

## Archiviate (post-v1)
| Idea | Perché rimandata |
|------|------------------|
```

---

## `state.json`

```json
{
  "fase": "2c",
  "milestoneCorrente": "M1",
  "taskCorrente": "T2",
  "cicliSenzaProgressoCharter": 0,
  "ultimoAggiornamento": "<ISO 8601>",
  "codexThreadId": "019f9bce-355f-7901-b804-771921713994",
  "codexSessionCreataIl": "<ISO 8601>",
  "codexSandbox": "read-only"
}
```

`cicliSenzaProgressoCharter` è il contatore anti-drift: a 3 il ciclo si ferma e avvisa l'utente.

`codexThreadId` è la sessione Codex del progetto, ripresa a ogni interazione con
`codex exec resume <id>`. Persiste fra sessioni Claude diverse. Se un resume fallisce,
ricrea la sessione con il briefing pack e **aggiorna questo campo**.

`codexSandbox` documenta la policy fissata alla creazione: non è riproponibile al resume,
quindi va ricordata qui per poter ricreare la sessione con gli stessi vincoli.
