# Casa TV — app Tizen para el Samsung del salón

*English version, with screenshots: [README.md](README.md).*

Una pantalla de inicio para la tele con dos funciones:

1. **Entradas**: Apple TV, PS5 y Euskaltel con un botón (o con las teclas roja / verde / amarilla, o 1-2-3).
2. **Rutinas**: tablero de mañana y de noche por crío, que se marca con OK y se reinicia solo cada día.

## El montaje de casa

| Equipo | Conexión | Notas |
|---|---|---|
| TV Samsung QN85D 75" (2024) | — | Tizen 8 de fábrica; con el firmware 2130.0 probablemente Tizen 9 (inferido, no comprobado). 4× HDMI 2.1 con ALLM/VRR/144 Hz |
| Apple TV | HDMI directo a la TV | |
| PS5 | HDMI directo a la TV | Necesita Modo Juego / VRR / 120 Hz → cambio vía SmartThings |
| Deco Euskaltel | HDMI directo a la TV | |
| Marantz NR1200 | Puerto (e)ARC de la TV | Sólo sonido. Es HDMI 2.0b (4K60) y estéreo: ponerlo en medio no aporta nada y en la práctica falla |

La app no controla el Marantz: con HDMI-CEC (Anynet+) se enciende y pasa a "TV Audio" solo. Si algún día eso falla, el NR1200 acepta control por red (activar "Network Control → Always On") y se podría añadir.

## Estructura

```
FamilyTV/
├── config.xml            manifiesto Tizen (privilegios, id del paquete)
├── index.html, icon.png
├── fonts/                Inter (libre, OFL): sustituto de San Francisco, que no se puede empaquetar fuera de Apple
├── img/                  renders 3D de las entradas (PNG) + tools/render para regenerarlos
├── css/style.css         UI a 1920×1080
├── js/config.js          ← configuración pública con valores de ejemplo: HDMI, vía de cambio, tareas, horarios
├── js/config.local.js    ← lo tuyo: críos, calendario familiar, credenciales (NO va al repo)
├── js/config.local.example.js ← plantilla del anterior
├── js/sources.js         cambio de entrada: tvwindow / SmartThings, elegido por entrada
├── js/routines.js        lógica de rutinas + persistencia (localStorage por día/franja)
├── js/nav.js             navegación espacial con las flechas del mando
├── js/app.js             render, teclas del mando, reloj
└── tools/
    ├── build-and-install.sh   alternativa por línea de comandos (Tizen Studio)
    └── smartthings-oauth.mjs  ayudante OAuth para la PS5
```

## Configuración privada

Los datos personales no van en `config.js` sino en `js/config.local.js`, que se carga justo después y lo sobrescribe:

```sh
cp js/config.local.example.js js/config.local.js
```

Ahí van los críos, las tareas de días concretos, el enlace del calendario familiar y, si lo usas, SmartThings. El fichero está en `.gitignore`. Hay que crearlo antes de compilar: el paquete lo incluye (`tizen_web_project.yaml`).

## Probarla ya en el Mac

Abre `index.html` en Chrome. Sin `tizen` disponible, la app simula las entradas.
Teclado: flechas + Enter; `R`/`G`/`Y` = teclas de colores; `B` = mañana/noche; `Esc` = Atrás.

## Cómo se cambia de entrada

Cada entrada elige su vía con `via` en `config.js`:

| | `tvwindow` (Apple TV, Euskaltel) | `smartthings` (PS5) |
|---|---|---|
| Qué hace | Pinta la señal HDMI a pantalla completa **dentro** de la app (API TVWindow, privilegio público) | Cambia la **entrada real** de la tele vía API cloud de SmartThings |
| Configuración | Ninguna | App OAuth + refresh token (ver abajo) |
| "Atrás" | Vuelve al tablero | La app ya se ha ocultado; estás en la entrada normal |
| Riesgo | Sospecho (no verificado) que dentro de la ventana de la app la tele no aplica Modo Juego/VRR | Depende de internet (~1 s) |

Si SmartThings no está configurado o falla, la PS5 se abre dentro de la app y sale un aviso en rojo. Así funciona desde el primer día y puedes comprobar si de verdad notas diferencia antes de configurar OAuth.

## Instalar en la tele (VS Code)

Extensión oficial actual: **Tizen TV Extension** (`samsungtvsdk.tv-vscode-tizen`, publisher `samsungtvsdk`). Instala sola la extensión base de Tizen.

1. **Extensión**: VS Code → Extensiones → busca "Tizen TV" → instala la de `samsungtvsdk`. En la barra de Tizen → *Packages* → *Advanced* → instala la extensión TV más reciente.
2. **Modo desarrollador en la TV**: Apps → teclea `1 2 3 4 5` con el mando → Developer mode **On** → IP de tu Mac → reinicia la tele (mantén el botón de encendido hasta que se reinicie). Mac y TV en la misma red.
3. **Conectar la TV**: en la extensión, *Actions* → **Connect Device** → *Remote Devices* → **+ Create Custom Connection** → nombre, IP de la tele y puerto `26101` → *Add* → selecciónala → **Connect**.
4. **Certificado Samsung** (con la tele ya conectada, para que salga su DUID):
   *Actions* → **Create Certificate** → nombre del perfil (p. ej. `casatv`) → **Create Samsung Certificate** → datos de autor (nombre y contraseña; guárdala) → *Distributor Details*: privilege level **Public** → marca la casilla del **DUID** de tu tele → **Create** → inicia sesión con tu cuenta Samsung cuando lo pida → comprueba que el perfil aparece en la lista.
5. Abre la carpeta `FamilyTV`, crea `js/config.local.js` (ver *Configuración privada*), ajusta `js/config.js` y, en *Actions*, **Run Project**. Excluye `tools/` y `README.md` del paquete si la extensión lo ofrece.
6. La primera vez, mira el pie de la app: "Con señal: HDMI 1 · HDMI 2…". El Marantz también puede aparecer; corrige los números de `config.js` si no cuadran y reinstala, o reasígnalos desde la tele con la tecla **8**.

Errores típicos: **1010** al instalar → certificado (que sea *Samsung*, no *Tizen*, y que lleve el DUID de esta tele). **1013** al ejecutar → reintentar o reiniciar la tele.

Alternativa por terminal (con Tizen Studio y su Certificate Manager): `./tools/build-and-install.sh <IP_TV> <perfil>`.

## SmartThings para la PS5

Desde diciembre de 2024 los *Personal Access Tokens* nuevos caducan a las 24 h, así que la app usa OAuth con refresh token (que rota y guarda ella misma).

```bash
npm i -g @smartthings/cli
smartthings apps:create          # tipo "API_ONLY", scopes r:devices:* x:devices:*, redirect p.ej. https://httpbin.org/get
node tools/smartthings-oauth.mjs url <clientId> https://httpbin.org/get
#   → abre la URL, autoriza, copia el "code" de la respuesta
node tools/smartthings-oauth.mjs token <clientId> <clientSecret> https://httpbin.org/get <code>
node tools/smartthings-oauth.mjs devices <access_token>   # → deviceId de la tele
```
Pega `deviceId`, `clientId`, `clientSecret` y `refreshToken` en `js/config.local.js`.
El *secret* queda dentro del paquete instalado en tu tele: aceptable para uso doméstico, no para distribuir la app.

## Adaptaciones por crío

- `focusMode: true` — **una orden cada vez**: en lugar de la lista, una tarjeta grande con la tarea actual en imperativo ("Vístete", campo `order` de cada tarea) y, debajo, la siguiente en pequeño. Al marcar con OK aparece la siguiente con el foco ya puesto. Las hechas quedan como iconos pequeños; pulsar OK sobre uno la desmarca.
- `syllables: true` — **sílabas en rojo y azul** sobre tarjeta clara (cada palabra empieza en rojo). `'continuous'` mantiene la alternancia entre palabras. El divisor silábico (`js/syllables.js`) cubre dígrafos, qu/gu, diptongos, hiatos y grupos consonánticos inseparables.

## Modo calendario

Botón **📅 Calendario** en la cabecera (o tecla **9**). Vista de la semana con el día de hoy resaltado:
- ◀▶ semana anterior/siguiente · **OK** vuelve a esta semana · **Atrás** cierra.
- Los eventos con el nombre de un crío en el título salen con su avatar y su color. Los festivos se resaltan.
- Los eventos de hoy que aún no han pasado aparecen también en el widget **Hoy** del panel.

**Conectar el calendario familiar (iCloud)**: en el iPhone, app Calendario → *Calendarios* → ⓘ junto al calendario familiar → activa **Calendario público** → **Compartir enlace** → *Copiar*. Pega el enlace (`webcal://…`) en `calendar.feeds`, feed "Familia", de `js/config.local.js`; la app lo convierte a https.
- Quien tenga el enlace puede ver el calendario (títulos, horas y lugares), aunque no aparece en ningún buscador. Para cortarlo, desactiva *Calendario público* (el enlace deja de funcionar).
- Los cambios no llegan al instante: iCloud tarda un rato en publicar y la app consulta cada 15 min.
- También vale un calendario de Google ("Dirección secreta en formato iCal").
Mientras no haya enlace, se ven datos de ejemplo (aviso en amarillo).

Detalles: se actualiza cada 15 min y guarda la última copia para funcionar sin red. Soporta eventos recurrentes (semanales, mensuales, anuales), excepciones, eventos movidos y cancelados. Las horas con zona horaria se toman como hora local de la tele.

## Tiempo

Con `ui.sourcesOnBoard: false` (por defecto) el panel no muestra los botones de entradas y su hueco lo ocupa una tarjeta grande del tiempo: icono, máxima y mínima, la prenda en grande para los críos, chubasquero si va a llover y la franja de `weather.hours` (8, 11, 14, 17 y 20 h). Las entradas se siguen cambiando con los botones de colores, 1-2-3 o la tecla 8. Con `sourcesOnBoard: true` vuelven los botones y el tiempo pasa a una pastilla en la cabecera, junto al calendario.
- Por la mañana es el tiempo de hoy; por la noche, el de **mañana**, para dejar la ropa preparada.
- La ropa sale de la temperatura a la hora de salir de casa (`departure.leave`), con los umbrales de `weather.clothes` en `config.js`.
- La lluvia es la probabilidad máxima entre las 7 y las 20 h. A partir de `weather.rainFrom` (40 %) añade "☔ Chubasquero".
- Datos de [Open-Meteo](https://open-meteo.com) (gratis, sin clave), cada 30 min. Sin red se ve la última descarga. La ubicación de casa va en `config.local.js`.

## Modo lámpara

Botón **🕯️ Lámpara** en la cabecera (o tecla **0**). La pantalla se convierte en una luz cálida y tenue para leer en el salón:
- ▲▼ intensidad (5–100 %) · ◀▶ calidez de 1800 K (vela) a 3500 K · **OK** alterna *completa* (más luz para leer) y *halo* (centro oscuro, luz en bordes: deslumbra menos).
- **Amarillo**: temporizador 15/30/45/60 min; el último minuto se funde a negro. **Atrás**: salir.
- Sin azul y sin parpadeo. Recuerda el último ajuste. Desactiva el salvapantallas de la tele mientras está encendida (API `webapis.appcommon`, sólo en la tele).
- La app no puede bajar la retroiluminación de la tele: para un tenue de verdad, combina con un modo de imagen poco brillante (p. ej. *Película*) o el modo de confort visual si tu tele lo tiene.

## Cuenta atrás para salir

Las mañanas de lunes a viernes, desde las 7:20 (luz del cuarto de los críos), una cápsula en la cabecera muestra cuánto falta para salir a las 8:30:
- Verde → ámbar (≤20 min) → rojo (≤5 min, con segundos en los últimos 10 min y viñeta roja en los bordes).
- 8:30–8:40: "¡A la calle!" con los minutos hasta el límite. Después de 8:40: "Llegamos tarde" y desaparece a las 9:00.
- **Ritmo**: compara tareas hechas con el tiempo transcurrido hasta las 8:20 (`readyBy`): *Vais bien* / *Vais justos* / *Hay que darse prisa* / *¡Listos! Zapatos y abrigo*.
- Campanitas a −10 min, −5 min, hora de salir y límite (`sound: false` para quitarlas).
- Horas y días en `departure` dentro de `config.js`.

## Aspecto

Lenguaje inspirado en Liquid Glass (tvOS 26 / iOS 27): fondo vivo que cambia de amanecer a noche, paneles de cristal con desenfoque y reflejo, tiles con parallax y brillo al enfocar, anillos de progreso por crío y hoja de celebración.

- `ui.transparency` (0–1) hace de deslizador de cristal estilo iOS 27: 0 = casi opaco y más legible, 1 = muy transparente.
- `ui.motion: false` apaga fondo animado y parallax si la tele va justa.
- La maqueta es de 1920×1080 y se escala sola a la pantalla (tele, navegador del Mac, ventanas de otra proporción) sin deformarse; el fondo rellena los márgenes.
- `avatar` de cada crío: emoji o letra dentro del anillo.
- `art` de cada entrada: ilustración en `img/` (render 3D en PNG con transparencia, 1360×672). Puedes cambiarla por una foto tuya en PNG/JPG de 680×336 o más.
- El desenfoque (`backdrop-filter`) es lo más caro para la GPU de la tele. Si notas tirones al moverte, baja `--blur` en `css/style.css` o desactiva `motion`.

## Rutinas: cómo se modelan

- Cada tarea: `{ id, label, icon, days?, kids? }`. Sin `days` = todos los días; sin `kids` = todos.
- Antes de `morningUntil` se muestra la mañana; después, la noche. La tecla azul fuerza la otra franja hasta el siguiente cambio automático.
- El estado se guarda como `routine:AAAA-MM-DD:franja`: no hay que "resetear" nada; se purgan los días de hace más de una semana.
- La noche va como deberes → cenar → pijama → dientes → leer; cambia el orden en `config.js` si lo hacéis distinto.

## Qué está verificado y qué no

- ✔ Probado en Chromium a 1920×1080 con mocks: navegación, marcado, persistencia, celebración, mañana/noche, Atrás, aviso de PS5 sin SmartThings.
- ✔ Documentado por Samsung: `tizen.tvwindow.setSource/show` con privilegio público `tv.window`; extensión Tizen TV para VS Code.
- ✘ No probado en la tele real: mapeo HDMI, audio de la TV window, Modo Juego dentro de la app y SmartThings en este modelo.
