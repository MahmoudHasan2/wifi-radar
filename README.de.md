# Emberline RF-9: Filmreife Scanner-Demo

[🇬🇧 English](README.md) · 🇩🇪 Deutsch

[![Live-Demo](https://img.shields.io/badge/Demo-GitHub%20Pages-ff5a1f)](https://mahmoudhasan2.github.io/wifi-radar/)
![Vanilla JS](https://img.shields.io/badge/Vanilla-JS%20%C2%B7%20ohne%20Abh%C3%A4ngigkeiten-F7DF1E?logo=javascript&logoColor=black)

**[▶ Live-Demo öffnen](https://mahmoudhasan2.github.io/wifi-radar/)**

Ein **visuelles Requisit** im Browser, das wie ein futuristischer, WLAN-gestützter Wärmescanner aussieht, der durch Wände blickt.

> **Das ist eine Simulation.** Sie erkennt keine Personen, keine Wärme, keine Bewegung und nichts hinter Wänden. Die Silhouetten werden per Code gezeichnet, die Zielangaben sind feste Texte im Skript, und die WLAN-Werte werden lokal mit Rauschfunktionen erzeugt. Normale WLAN-Signale und Webcams können weder Geschlecht, Alter, Größe, Gewicht noch Standort einer Person durch eine Wand erkennen.

Reines HTML, CSS und Vanilla JavaScript. Kein Backend, kein Build-Schritt, keine Abhängigkeiten, keine externen Schriften oder heruntergeladenen Dateien. Alle Grafiken werden mit CSS und Canvas erzeugt.

```
index.html   Seitenstruktur
styles.css   Design, Layout, responsive Regeln und Regeln für reduzierte Bewegung
app.js       Render-Schleife, Szenarien, prozedurale Figuren, Telemetrie, Kamera, Eingabe
README.md    englische Beschreibung
```

---

## Starten

### Variante A: Datei öffnen
Doppelklick auf `index.html`. Sie öffnet sich in Chrome, Edge oder Firefox.

Manche Browser verweigern den Kamerazugriff für Seiten, die als `file://` geöffnet werden. Wenn **Start camera** einen Fehler zeigt, nimm Variante B. Der Rest der Demo funktioniert in beiden Fällen.

### Variante B: lokaler HTTP-Server (empfohlen für die Kamera)
In diesem Ordner einen der folgenden Befehle ausführen:

```bash
# Python 3
python -m http.server 8000

# Node.js
npx serve -l 8000 .
```

Dann **http://localhost:8000** öffnen. Browser behandeln `localhost` als sicheren Ursprung, deshalb funktioniert die Kamera dort.

### Vor einem Dreh
1. Seite öffnen und **F** drücken (oder auf Fullscreen klicken).
2. Optional: auf **Start camera** klicken und den Zugriff erlauben. Das Bild dient nur als Hintergrund.
3. **1** oder **2** drücken, wenn eine Szene abgespielt werden soll.

---

## Tastenkürzel

| Taste | Aktion |
|---|---|
| `1` | **Szenario 1.** 3 s Countdown, kurzer Erfassungs-Sweep, dann 15 s eine gehende männliche Silhouette, die den Wandbereich durchquert, kurz stehen bleibt und hinausgeht. Die Overlays blenden aus und der Scanner kehrt in den Standby zurück. |
| `2` | **Szenario 2.** Startet sofort (ohne Countdown). 10 s eine weibliche Silhouette, die sich im Raum bewegt: Sie geht zu einem Tisch, beugt sich vor und wischt ihn ab, dreht sich um und geht zurück. Danach sauberes Ausblenden in den Standby. |
| `Leertaste` | Scannen starten oder stoppen. Stoppen hält alle Animationsschleifen und Töne an. |
| `V` | Scan-Ansicht an/aus. Aus blendet Szene, Silhouette und alle Overlays auf einmal aus und stoppt ein laufendes Szenario. |
| `Esc` | Vollbild verlassen, falls aktiv; sonst das laufende Szenario stoppen (oder die Kürzel-Übersicht schließen). |
| `F` | Vollbild umschalten. |
| `R` | Zurücksetzen: Szenario stoppen, Scan-Ansicht an, Scannen an, Zähler zurückgesetzt. Die Kamera bleibt, wie sie ist. |
| `C` | Kamera an/aus. |
| `M` | Synthetische Töne stumm/an. |
| `P` | **Prank-Modus.** Blendet die Simulationshinweise aus (oberes Badge, Wasserzeichen, SIM-Markierungen). Erneut drücken blendet sie wieder ein. Standardmäßig aus. |
| `X` | **Prank-Auflösung.** Zeigt eine Vollbild-Nachricht „Das ist ein Streich“ auf Englisch und Arabisch. Mit `X` oder `Esc` schließen. |
| `H` oder `?` | Kürzel-Übersicht ein-/ausblenden. |

Verhalten der Kürzel:
- Kürzel werden ignoriert, solange in ein Textfeld getippt wird oder Strg, Alt bzw. Cmd gedrückt ist.
- Gedrückt gehaltene Tasten lösen nicht mehrfach aus (Auto-Repeat wird ignoriert).
- `1` oder `2` während eines Szenarios bricht es sauber ab und startet das neue von vorn.
- Ist die Scan-Ansicht aus, zeigen `1` und `2` nur einen Hinweis und tun nichts. Zuerst `V` drücken.
- Im Vollbild nutzen die meisten Browser das erste `Esc`, um das Vollbild selbst zu beenden. Erneut `Esc` drücken, um das Szenario zu stoppen.

Szenarien werden nur über die Tastatur gestartet (es gibt keine Szenario-Buttons auf dem Bildschirm). Die übrigen Funktionen haben auch Buttons.

---

## Szenariodaten (fiktiv)

| | Szenario 1 | Szenario 2 |
|---|---|---|
| Ziel | MÄNNLICH | WEIBLICH |
| Geschätztes Alter | 30–35 | 22 |
| Größe | 175 cm | 168 cm |
| Gewicht | 70–75 kg | 55 kg |
| Status | SIMULATED TRACKING | SIMULATED TRACKING |
| Ablauf | 3 s Countdown → 1,2 s Sweep → 15 s aktiv → 3 s Abgang/Ausblenden | 10 s aktiv → 1 s Ausblenden |

Diese Werte stehen im Objekt `SCENARIOS` am Anfang von `app.js` und lassen sich dort ändern. Sie werden nie aus der Kamera, dem WLAN oder einer echten Person abgeleitet. Jeder Wert ist auf dem Bildschirm mit **SIM** markiert.

---

## Scan-Ansicht und Ausrichtung des Laptops

Der Bediener kann den Laptop physisch zu einer anderen Wand drehen. Die Demo **weiß nicht und kann nicht wissen**, in welche Richtung der Laptop zeigt. Es gibt keine Gesichtserkennung, keine Bewegungsanalyse und keine versteckte Kameraauswertung.

Stattdessen nutzt der Bediener den Schalter **Scan-Ansicht** (`V`):
- **Aus:** Szene, Silhouette und Tracking-Overlays verschwinden sofort, ein laufendes Szenario stoppt.
- **An:** Die Standby-Scanoberfläche kehrt zurück, bereit für `1` oder `2`.

---

## Kamera und Datenschutz

- Die Kamera wird **nur** angefordert, wenn du auf **Start camera** klickst (oder `C` drückst). Sie startet nie automatisch. Das Mikrofon wird nie angefordert.
- Solange sie an ist, zeigen eine rote Anzeige **CAMERA LIVE** und ein Chip `CAM LIVE` in der oberen Leiste das an. **Camera off** gibt das Gerät sofort frei.
- Das Bild erscheint im Vorschaufenster und als schwacher Hintergrund im Wärmebild-Panel. Es wird **nicht** analysiert, aufgezeichnet, gespeichert, hochgeladen oder übertragen. Nichts verlässt die Seite.
- Wird die Berechtigung verweigert oder gibt es keine Kamera, erscheint eine klare Meldung, und die Demo läuft mit einem animierten Standby-Hintergrund weiter.

## WLAN-Telemetrie

Browser geben WLAN-Signalstärke, Kanäle, Spektrum oder Pakete **nicht** an Webseiten weiter. Jeder Wert im Telemetrie-Panel (Anzeige, Wellenform, Spektrum, Radar, Qualität, Paketprotokoll) wird lokal erzeugt und ist als **SIMULATED SIGNAL** markiert.

Die einzigen echten Daten stehen in der kleinen Zeile unten im Panel. Sie stammen aus der **Network Information API** des Browsers (`navigator.connection`). Diese gibt es nur in Chromium-Browsern, und sie meldet nur eine grobe Verbindungsklasse (z. B. `4G`) sowie ungefähre Schätzungen für Downlink und RTT. Firefox und Safari melden „not exposed“.

---

## Barrierefreiheit und Zuverlässigkeit

- **Reduzierte Bewegung:** Ist im Betriebssystem *Bewegung reduzieren* aktiviert, werden Sweeps, Flackern, Sensorrauschen, Text-Scrambling und pulsierende Effekte abgeschaltet oder verlangsamt. Die geskriptete Bewegung der Figur läuft weiter, weil sie der eigentliche Inhalt ist.
- **Eine Render-Schleife:** Das gesamte Szenario-Timing basiert auf `performance.now()` in einer abgesicherten `requestAnimationFrame`-Schleife. Es gibt keine `setTimeout`-Ketten, wiederholte Tastendrücke können also keine Timer stapeln. Stoppen des Scannens beendet die Schleife komplett.
- **Ton:** Kurze Töne werden mit der Web Audio API synthetisiert. Es werden keine Audiodateien verwendet, und Ton startet erst nach einem Tastendruck oder Klick. Alle aktiven Töne stoppen, wenn ein Szenario abgebrochen, das Scannen beendet oder stummgeschaltet wird.
- **Layout:** ausgelegt für Laptop-Bildschirme (1280×720 bis 1920×1080). Schmalere oder niedrigere Fenster wechseln zu einem scrollbaren, gestapelten Layout.

## Browser-Unterstützung

Getestet im aktuellen Chrome/Edge. Firefox und Safari werden ebenfalls unterstützt. Wo die Canvas-Eigenschaft `filter` fehlt (älteres Safari), nutzen die Silhouetten statt Weichzeichnung einen schattenbasierten Glow.
