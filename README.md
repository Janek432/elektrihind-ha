# Elektrihind Home Assistantile

Eesti elektri **lõpphind** (Nord Pool börs + Elektrilevi tasud + KM, riigipühad) Home Assistantis,
seadmete juhtimine hinna järgi ja aku laadimisplaan. Hinnaandmed tulevad avalikust repost
[Janek432/elektrihind](https://github.com/Janek432/elektrihind) (sama allikas mis Android-äpil ja Wemose ekraanil).

## Esmane paigaldus

1. **Settings → Apps** → paigalda ja käivita **File editor** (Show in sidebar sisse).
2. Loo File editoris kaustas `/config` kaustad `packages`, `custom_templates` ja `www` (kui puuduvad)
   ning laadi üles failid:

   | Fail repos | Koht HA-s |
   | --- | --- |
   | `packages/elektrihind.yaml` | `/config/packages/elektrihind.yaml` |
   | `custom_templates/elektrihind.jinja` | `/config/custom_templates/elektrihind.jinja` |
   | `www/elektrihind-card.js` | `/config/www/elektrihind-card.js` |

3. Lisa `configuration.yaml` algusesse:

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

4. Profiilis lülita sisse **Advanced mode**. **Settings → Tools → YAML → Check configuration**,
   seejärel **Settings → System → Restart**.
5. **Settings → Dashboards → ⋮ → Resources → Add resource**: `/local/elektrihind-card.js?v=2.4.0`,
   tüüp **JavaScript module**.
6. Dashboardil **Edit → Add card → By card**, otsi „Elektrihind“ ja lisa kaardid.

## Uuendamine

Home Assistant kontrollib iga 6 tunni järel faili `version.json`. Kui siin on uuem versioon, ilmub
hinnakaardile riba **„Uuendus saadaval“** koos muudatustega. Nupp **Uuenda** (ainult administraatorile):

1. laeb alla täpselt selle versiooni haru (`versioon-2.3.0` jne) kolm faili,
2. laadib Home Assistanti mallid ja YAML-i uuesti (või taaskäivitab, kui versioon seda nõuab),
3. uuendab dashboardi ressursi versiooninumbrit ja värskendab lehte.

Kõik seaded (tasud, seadmed, aku) on salvestatud Home Assistantis, mitte failides – uuendus neid ei muuda.

Käsitsi: **Settings → Automations & scenes → Scripts → „Elektrihind: uuenda GitHubist“ → Run**.

### Uue versiooni avaldamine (arendajale)

1. Muuda faile, tõsta versiooni **kolmes kohas**: `version.json`, `packages/elektrihind.yaml`
   (`sensor.elektrihind_versioon` ja päis) ning `www/elektrihind-card.js` (`EH_VERSION`).
2. Kui pakett vajab taaskäivitust (nt uus `shell_command` või `rest` allikas), pane `version.json`-is `"taaskaivitus": true`.
3. Commit ja push: kõigepealt versiooni haru, siis `main` (HA laeb failid versiooni haru järgi,
   `main`-i `version.json` annab teada, et uus versioon on olemas):

   ```sh
   git push origin HEAD:refs/heads/versioon-2.3.0 && git push origin main
   ```

## Kaardid

- `custom:elektrihind-card` – hetkehind, päeva graafik, ⚙ tasud ja värvid
- `custom:elektrihind-seadmed-card` – seadmete juhtimine (odavaim aeg / hinnapiir), käsitsi Sees / Väljas valitud ajaks
- `custom:elektrihind-aku-card` – aku plaan (lae / kata tarbimine / hoia), ⚙ aku seaded

## Olemid

| Olem | Sisu |
| --- | --- |
| `sensor.elektrihind` | praegune lõpphind s/kWh (+ börs, järgmine, min/max/keskmine) |
| `sensor.elektrihind_tabel` | kõik veerandtunnid lõpphindadega (täna + homme) |
| `sensor.elektrihind_seaded` | kaardilt salvestatud tasud ja värvid |
| `sensor.elektrihind_reeglid` / `sensor.elektrihind_juhtimine` | seadmete reeglid / plaan |
| `sensor.elektrihind_aku_seaded` / `sensor.elektrihind_aku_plaan` | aku seaded / plaan |
| `sensor.elektrihind_aku` | aku praegune tegevus: `lae`, `kasuta`, `hoia` (+ `laadimine_kw`) |
| `sensor.elektrihind_kasud` | automaatika viimased käsud (ise lülitamise äratundmiseks) |
| `sensor.elektrihind_versioon` / `sensor.elektrihind_uusim_versioon` | paigaldatud / GitHubi uusim versioon |

Automatiseerimine **„Elektrihind: seadmete juhtimine“** lülitab seadmeid iga minut, kui olek peab muutuma.
Järjekord: ise lülitatud seade (ootab valitud tunnid) → käsitsi kaardilt (Sees / Väljas kuni) → hinnaplaan → varuplaan (kui hinnad puuduvad).

## Juhtimisviisid

- **Odavaim aeg** – igas kellaaja vahemikus N tundi kõige odavamat aega (veerandtunni täpsusega):
  alati plokina / eelista plokki (lubatud keskmise hinna vahe X, muidu tükid vähemalt M veerandtundi) /
  hajutatult. Valikuline maksimumhind (üldine ja iga vahemiku oma). Valikuliselt lisaks alati sees, kui hind ≤ X (oma kellaaja vahemikes).
- **Hinnapiir** – sees, kui lõpphind ≤ X; valikuliselt vähemalt N tundi ööpäevas/vahemikus; kogu ööpäev või vahemikud.
- **Varuplaan** – kui hinnad puuduvad: öötariifi ajal (22–07, L–P) / valitud kellaaegadel (mitu vahemikku) / alati sees / väljas.

## Aku planeerija

Dünaamiline planeerimine üle teadaolevate hindade (aku tase 0,5 kWh sammuga). Arvestab lõpphinda,
ringkasutegurit, aku kulumist ja lülituste trahvi. Võrku ei müüda (Deye null-eksport).
Aku taseme andur on valikuline; ilma selleta jätkab plaan eelmise plaani tasemest.

**Veel tegemata:** Deye juhtimine (ajaprogramm / laadimisvool), faasivoolu piiramine reaalajas
(seadetes on faasipiir ja hajutatud algus juba olemas). Maja liitumine 3 × 80 A (18 korterit),
korter 3 × 25 A – hoia laadimisvõimsus mõõdukas.
