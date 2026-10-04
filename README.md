# Audio Journal

> Talk messy, read clean.

A voice journal that fixes itself. Ramble into your mic, and get back a tidy, dated diary entry you'd actually want to re-read.

## Features

- One-tap voice recording with a live transcript
- Automatic cleanup: filler words removed, capitals and punctuation added, paragraph breaks at pauses
- Notebook-style entry card with date, time and word count
- Switch between the clean and raw version of any entry
- Entry history, copy to clipboard, delete
- Dark and light mode
- Entries stay in your browser (`localStorage`), with no account needed

## Tech

HTML, CSS and vanilla JavaScript. Speech comes from the Web Speech API in Chrome and Edge. In browsers without it (like Brave), audio is recorded with `MediaRecorder` and transcribed by a small Node server using a Whisper API.

## Run it

**Chrome or Edge (no setup):** open the folder in VS Code, start Live Server, and go to `/journal.html`.

**Any browser (needs the Node server):**

```bash
npm install express multer dotenv
cp .env.example .env     # then add your API key
node server.js
```

Open `http://localhost:3000`.

`.env` settings:

```
STT_API_KEY=your_key_here
STT_BASE_URL=https://api.openai.com/v1
STT_MODEL=whisper-1
```

Groq works too. Use `https://api.groq.com/openai/v1` as the base URL and `whisper-large-v3-turbo` as the model.

## Project structure

```
audio-journal/
├── index.html       Landing page
├── journal.html     The recorder app
├── server.js        Optional transcription server
├── css/
│   ├── base.css     Colours, themes, shared styles
│   ├── landing.css  Landing page
│   └── app.css      Journal page
└── js/
    ├── theme.js     Dark/light toggle
    └── app.js       Recording, cleanup, storage, history
```

## Roadmap

- [ ] Mood tags
- [ ] AI grammar enhancement
- [ ] Export as plain text or WhatsApp message
- [ ] Search across entries

## Notes

- Keep your API key in `.env` only. It is git-ignored and must never go in frontend code.
- The Node server is needed only for browsers without built-in speech recognition. Static hosts like Netlify can't run it.