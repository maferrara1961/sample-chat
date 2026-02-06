# sample-chat

Ejemplo para un video de YouTube. App web con chat multi-modelo de OpenAI, historial de conversaciones y titulos generados por IA.

## Requisitos

- Node.js 18+
- Variable de entorno `OPENAI_API_KEY`

## Instalacion

```bash
npm install
```

## Ejecucion

```bash
OPENAI_API_KEY=tu_key npm start
```

Abre `http://localhost:10000`.

## Estructura

- `server.js`: API y servidor Express.
- `public/`: frontend estatico.
