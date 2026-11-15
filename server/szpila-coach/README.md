# szpila-coach

Opcjonalny serwer do „Podsumowania dnia”: mały lokalny model (Ollama) dopisuje komentarz jak
od kumpla. Telefon wysyła tylko procent dnia i nazwy zadań (nigdy dyskretnych), a dostaje dwa
zdania. Każda odpowiedź jest sprawdzana (bez liczb, bez form zależnych od płci, bez
zawyżania wyniku, bez formatowania); gdy się nie uda, aplikacja zostaje przy własnym tekście.

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
