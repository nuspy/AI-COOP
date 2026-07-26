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
