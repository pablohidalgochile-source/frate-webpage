# Prompt — «Busca todos los manuales que hiciste»

Pégalo en la sesión de Claude/Codex de **cada** proyecto: ERP · POS · WEB · FLYER
— y también en los brazos del holding (FRATV, FRAT Company, OPUS, FRATEXPRESS)
si tienen material.

Es un **inventario**: no se escribe nada nuevo todavía.

---

```
Necesito que RECOPILES y me listes TODO el material de documentación y manuales
que este proyecto haya producido. NO escribas nada nuevo — esto es un inventario.

CONTEXTO (para que sepas dónde encaja)
Fraternidad Campus Central corre sobre 4 sistemas — Flyer, Web/ticketera, POS,
ERP — dentro del holding GRUPO FAMILIAR. Ya existe un "libro" de manuales:
la serie FRATE OS, con un índice maestro en frate.cl/os-libro que reúne las 4
series (Web 14 cap · ERP 7 · POS 7 · Flyer 7). Quiero sumar a ese libro TODO
manual suelto que hayamos hecho y que todavía no esté enganchado.

IDENTIDAD DE COLOR OFICIAL (para que reconozcas y no confundas)
  ERP = fucsia #FF2D8B   ·   Web/Ticketera = rojo #FF3B3B
  POS = morado #A855F7   ·   Flyer = verde/cyan #06E5B0
  Empresas: Magnus Pro dorado · Campus Central azul · Fraternidad fucsia ·
  FRATV naranjo · FRAT Company violeta · FRATEXPRESS amarillo · OPUS teal.

QUÉ BUSCAR (no solo lo que se llame "manual")
1. Manuales y guías: os-*.html, manual-*.html, *guia*, *instructivo*, *bienvenida*.
2. Docs que EXPLIQUEN cómo funciona algo aunque no se llamen manual:
   READMEs largos, *.md de "cómo funciona X", onboarding, capacitación.
3. Handoffs y contratos: HANDOFF-*.md, CONTRATO-*.md, ARQUITECTURA-*.md, PROMPT-*.md.
4. Mockups y prototipos de pantallas hechos antes de programar.

DÓNDE BUSCAR
- Todo el repo de este proyecto (incluye docs/, public/, design_*/, *handoff*/).
- ~/Downloads/ y ~/Desktop/ (solo lo que tenga FRATE en el nombre).
- Zips o carpetas de Claude Design / prototipos.

CÓMO ENTREGARLO — una tabla
Para cada cosa: ruta · qué explica · fecha · ¿publicado o solo en disco? ·
y su estado contra el CÓDIGO REAL:
  🟢 vigente (describe cómo funciona hoy)
  🟡 desactualizado (fue verdad, ya no)
  🔴 contradice al código (dice una cosa, el sistema hace otra) ← lo más importante

AL FINAL, dame TRES listas cortas
A) Manuales listos para sumar al libro (con qué serie/sistema y su color).
B) Contradicciones — documento vs código, con el archivo:línea que lo desmiente.
   No adivines: ábrelo y verifícalo.
C) Huecos — qué parte de este sistema NO está documentada en ninguna parte.

REGLAS
- Verifica contra el código real. Si no puedes confirmarlo, dilo, no supongas.
- No borres nada. Mover sí, borrar no (y avísame qué moverías).
- No escribas manuales nuevos en esta pasada.
- Español de Chile, tuteo. Nunca argentinismos ni voseo.

Cuando termines: dime qué encontraste, qué propones sumar al libro maestro
(frate.cl/os-libro) y con qué color/serie, y espera mi confirmación.
```
