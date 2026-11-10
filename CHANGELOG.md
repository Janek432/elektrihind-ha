# Muudatused

## 2.6.0 – 2026-11-10
- Seadmete vormis on kellaajad alati 24h vormingus: tund (00–23) ja minutid (00/15/30/45) rippmenüüst,
  brauseri keelest sõltumata (enne näitas ingliskeelne brauser AM/PM).

## 2.5.1 – 2026-11-10
- Uuenduste kontroll GitHubi API kaudu: uus versioon on minuti jooksul näha
  (otselink hoidis haru `main` kuni 5 minutit vahemälus).

## 2.5.0 – 2026-11-10
- Hinnakaardi ⚙ seadete ülaosas on paigaldatud versioon, nupp **Kontrolli uuendusi** ja
  (kui uuem on olemas) **Uuenda**.

## 2.4.0 – 2026-11-10
- Seadmed, odavaim aeg: igal kellaaja vahemikul on oma **max s/kWh** lahter. Vahemikust ei kasutata
  veerandtunde, mis on sellest kallimad. Üldine maksimumhind jääb alles – kehtivad mõlemad.

## 2.3.0 – 2026-11-10
- Seadmed, odavaim aeg: lisavalik **„Lisaks alati sees, kui lõpphind on kuni X s/kWh“**.
  Seade on sees iga veerandtund, mil hind on piirist madalam või võrdne – lisaks odavaimale ajale.
- Lisavalikul on oma kellaaja vahemikud: kogu ööpäev või mitu vahemikku (nt boiler ainult 06–22).

## 2.2.0 – 2026-11-10
- Uuendused GitHubist: hinnakaardil ilmub riba „Uuendus saadaval“ ja nupp **Uuenda**
  (laeb alla täpselt selle versiooni failid harust `versioon-X.Y.Z`, laadib HA seaded uuesti, värskendab kaardi).
- Seadmed: käsitsi menüü – Sees 30 min / 1 h / 2 h / 3 h, Väljas 1 h / 3 h / 6 h / kuni keskööni / kuni homme õhtuni.
- Seadmed: kui seadet lülitatakse ise (Home Assistantis või seadme nupust), ei puuduta automaatika
  seda valitud arv tunde (vaikimisi 2 h). Kaardil on näha, kui kaua automaatika ootab.

## 2.1.0
- Varuplaan valitud kellaaegadel, kui hinnad puuduvad.

## 2.0.0
- Aku planeerija (lae / kata tarbimine / hoia) ja aku kaart.
- Seadmed: varuplaan, „vähemalt N tundi“ hinnapiirile, maksimumhind, Sees 1 h / Paus täna.

## 1.x
- Lõpphind (börs + tasud + KM, riigipühad) nagu Wemose ekraanil ja Android-äpis.
- Hinnakaart, tasude seaded kaardilt, seadmete juhtimine (odavaim aeg veerandtunni täpsusega,
  plokid ja tükid, mitu kellaaja vahemikku, hinnapiir).
