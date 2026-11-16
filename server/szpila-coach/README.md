# szpila-coach

Opcjonalny serwer dla Szpili: mały lokalny model (Ollama) pisze komentarze jak od kumpla.
Jeden endpoint, `POST /v1/comment`, pole `kind`:

- `day` (domyślnie): wieczorne podsumowanie dnia (procent, co zrobione, czego zabrakło, wpadki),
- `week`: niedzielny komentarz do tygodnia (procent vs poprzedni tydzień, najlepsze i najsłabsze),
- `forecast`: poranna prognoza na dziś (zagrożone zadania i dlaczego, plan na dziś).

Telefon wysyła tylko procenty i nazwy zadań (nigdy dyskretnych). Każda odpowiedź jest
sprawdzana: bez liczb, bez form zależnych od płci, ton musi pasować do wyniku (żadnych pochwał
przy słabym dniu), poprawne imię, bez zadań spoza listy, bez formatowania. Zdanie łamiące
regułę jest wycinane; gdy nic dobrego nie zostanie, serwer próbuje ponownie, a w ostateczności
aplikacja zostaje przy własnym tekście. W logach są tylko kody powodów, nigdy treść.

## Uruchomienie

1. Ollama z modelem, np. Bielik 4.5B v3 przekwantyzowany lokalnie do Q4:

   ```bash
   ollama pull SpeakLeash/bielik-4.5b-v3.0-instruct:FP16
   printf 'FROM SpeakLeash/bielik-4.5b-v3.0-instruct:FP16\n' > Modelfile
   ollama create bielik-4.5b-v3-q4 -q q4_K_M -f Modelfile
   ```

2. Token (tylko na serwerze):

   ```bash
   python3 -c "import secrets;a='abcdefghjkmnpqrstuvwxyz23456789';print('COACH_TOKEN='+'-'.join(''.join(secrets.choice(a) for _ in range(4)) for _ in range(5)))" > .env
   chmod 600 .env
   ```

3. Tunel Cloudflare (bez otwierania portów): `cloudflared tunnel create szpila`, skopiuj plik
   z danymi tunelu do `cloudflared/creds.json`, utwórz `cloudflared/config.yml` (ingress:
   twoja-domena → `http://127.0.0.1:8790`) i `cloudflared tunnel route dns szpila twoja-domena`.

4. `docker compose up -d --build`

5. W aplikacji: Ustawienia → Powiadomienia → Podsumowanie dnia → „Komentarz z własnego serwera
   AI”: adres `https://twoja-domena` i token.

Zmienne: `COACH_TOKEN` (wymagany), `OLLAMA_URL` (domyślnie `http://172.17.0.1:11434`),
`COACH_MODEL` (domyślnie `bielik-4.5b-v3-q4`), `COACH_PORT` (domyślnie `8790`).
